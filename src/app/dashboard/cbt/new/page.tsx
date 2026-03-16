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
}

const emptyQuestion = (): Question => ({
  question_text: '',
  question_type: 'multiple_choice',
  options: ['', '', '', ''],
  correct_answer: '',
  points: 5,
});

export default function NewExamPage() {
  const router = useRouter();
  const { profile, loading: authLoading, profileLoading } = useAuth();
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const preProgramId = searchParams?.get('program_id');
  const preCourseId = searchParams?.get('course_id');
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
  });
  const [questions, setQuestions] = useState<Question[]>([emptyQuestion()]);

  // AI Generation State
  const [aiOpen, setAiOpen] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiTopic, setAiTopic] = useState('');
  const [aiQuestionCount, setAiQuestionCount] = useState('10');
  // Track which questions are selected (all selected by default)
  const [selectedQuestions, setSelectedQuestions] = useState<Set<number>>(new Set());

  const handleAiGenerate = async () => {
    if (!aiTopic.trim()) { setAiError('Enter a topic first.'); return; }
    setAiGenerating(true);
    setAiError(null);
    try {
      const count = Math.max(1, Math.min(50, parseInt(aiQuestionCount) || 10));
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'cbt', topic: aiTopic, questionCount: count })
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
      const examPayload: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        program_id: form.program_id,
        course_id: form.course_id || null,
        duration_minutes: parseInt(form.duration_minutes) || 60,
        passing_score: parseInt(form.passing_score) || 70,
        total_questions: validQuestions.length,
        is_active: form.is_active,
        questions: validQuestions.map((q, i) => ({
          question_text: q.question_text.trim(),
          question_type: q.question_type,
          options: q.question_type === 'multiple_choice' ? q.options.filter((o: string) => o.trim()) : null,
          correct_answer: q.correct_answer.trim(),
          points: q.points,
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
    const toPrint = questions.filter((q, i) =>
      q.question_text.trim() && (!hasSelection || selectedQuestions.has(i))
    );
    if (toPrint.length === 0) { alert('No questions to print. Add questions first.'); return; }

    const docRef = `CBT-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });
    const prog = programs.find(p => p.id === form.program_id)?.name ?? '';
    const course = courses.find(c => c.id === form.course_id)?.title ?? '';
    const totalPts = toPrint.reduce((s, q) => s + (q.points || 0), 0);

    const optLabels = ['A', 'B', 'C', 'D', 'E', 'F'];

    const questionRows = toPrint.map((q, i) => {
      const isChoice = q.question_type === 'multiple_choice';
      const opts = isChoice
        ? q.options.filter(o => o.trim()).map((o, j) => `<span style="margin-right:14px;white-space:nowrap"><b>${optLabels[j]}.</b> ${o}</span>`).join('')
        : '';
      return `<div style="break-inside:avoid;margin-bottom:7px;padding:5px 8px;border-left:2px solid #7c3aed22;background:${i % 2 === 0 ? '#fafafa' : '#fff'}">
  <div style="display:flex;align-items:flex-start;gap:6px">
    <span style="font-weight:800;font-size:11px;color:#4c1d95;min-width:22px;padding-top:1px">${i + 1}.</span>
    <div style="flex:1">
      <span style="font-size:11.5px;color:#1f2937;line-height:1.4">${q.question_text}</span>
      ${isChoice ? `<div style="margin-top:4px;font-size:10.5px;color:#374151;display:flex;flex-wrap:wrap;gap:2px">${opts}</div>` : '<div style="margin-top:6px;border-bottom:1px solid #d1d5db;width:60%;height:1px"></div>'}
      <span style="font-size:9px;color:#9ca3af;float:right">[${q.points} pt${q.points !== 1 ? 's' : ''}]</span>
    </div>
  </div>
</div>`;
    }).join('');

    const answerRows = toPrint.map((q, i) => {
      const isChoice = q.question_type === 'multiple_choice';
      const optIdx = isChoice ? q.options.findIndex(o => o.trim() === q.correct_answer.trim()) : -1;
      const label = optIdx >= 0 ? optLabels[optIdx] : (q.correct_answer || '—');
      return `<tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:3px 8px;text-align:center;font-weight:700;font-size:10.5px;color:#4c1d95">${i + 1}</td>
        <td style="padding:3px 8px;font-size:10px;color:#111827;max-width:260px">${q.question_text.length > 60 ? q.question_text.slice(0, 60) + '…' : q.question_text}</td>
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
.logo-block{display:flex;align-items:center;gap:10px}
.logo-circle{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#4f46e5);display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:17px}
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
    <div class="logo-circle">R</div>
    <div>
      <div class="org-name">Rillcod Academy</div>
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
      <div class="logo-circle" style="background:linear-gradient(135deg,#dc2626,#b91c1c)">R</div>
      <div>
        <div class="org-name" style="color:#dc2626">Rillcod Academy — Marking Guide</div>
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
<div class="watermark">Rillcod Academy · ${docRef} · This is a computer-generated examination document.</div>
</body></html>`;

    const w = window.open('', '_blank', 'width=900,height=750');
    if (!w) { alert('Pop-up blocked. Please allow pop-ups.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 600);
  };

  if (authLoading || profileLoading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!isStaff) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <p className="text-white/40">Staff access required.</p>
    </div>
  );

  return (
    <div className={`min-h-screen bg-[#0f0f1a] text-white ${isMinimal ? 'p-0' : 'p-4 sm:p-8'}`}>
      <div className={`${isMinimal ? 'w-full' : 'max-w-4xl mx-auto'} space-y-6`}>
        {!isMinimal && (
          <Link href="/dashboard/cbt" className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
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
            {!isMinimal && <p className="text-white/40 text-sm mt-1 font-medium italic">Architect your assessment environment</p>}
          </div>
          <div className="flex items-center gap-2">
            {questions.some(q => q.question_text.trim()) && (
              <button
                type="button"
                onClick={handlePrintExam}
                className="flex items-center gap-2 px-5 py-3 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-400 font-black text-xs uppercase tracking-[0.2em] rounded-2xl transition-all"
              >
                Print Exam
              </button>
            )}
            <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-emerald-900/40 transition-all disabled:opacity-50">
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

        {/* AI Generate Panel */}
        <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setAiOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <ArrowPathIcon className={`w-4 h-4 text-emerald-400 ${aiGenerating ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Generate with AI</p>
                <p className="text-xs text-white/40">Auto-fill exam details and questions</p>
              </div>
            </div>
            {aiOpen ? <ChevronDownIcon className="w-4 h-4 text-white/40" /> : <ChevronDownIcon className="w-4 h-4 text-white/40 rotate-180" />}
          </button>

          {aiOpen && (
            <div className="px-5 pb-5 space-y-4 border-t border-emerald-500/20 bg-white/5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Topic / Subject Matter</label>
                  <input
                    value={aiTopic}
                    onChange={e => setAiTopic(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAiGenerate(); } }}
                    placeholder="e.g. Fundamental Concepts of AI & Machine Learning"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">No. of Questions</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={aiQuestionCount}
                    onChange={e => setAiQuestionCount(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleAiGenerate}
                disabled={aiGenerating}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all"
              >
                {aiGenerating ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
                {aiGenerating ? 'Generating...' : `Generate ${aiQuestionCount} Questions`}
              </button>
              {aiError && <p className="text-[10px] text-rose-400 mt-2">{aiError}</p>}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Exam Details */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest">Exam Details</h2>

            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">
                Exam Title <span className="text-rose-400">*</span>
              </label>
              <input type="text" required value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Python Programming Midterm"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-emerald-500 transition-colors" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">
                  Programme <span className="text-rose-400">*</span>
                </label>
                <select required value={form.program_id}
                  onChange={e => setForm(f => ({ ...f, program_id: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer">
                  <option value="">Select programme…</option>
                  {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">
                  Linked Course (Optional)
                </label>
                <select value={form.course_id}
                  onChange={e => {
                    const cId = e.target.value;
                    const c = courses.find(x => x.id === cId);
                    setForm(f => ({ ...f, course_id: cId, program_id: c?.program_id || f.program_id }));
                  }}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer">
                  <option value="">Not linked to a course</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title} {c.programs?.name ? `(${c.programs.name})` : ''}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Duration (min)</label>
                <input type="number" min="5" value={form.duration_minutes}
                  onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Passing Score (%)</label>
                <input type="number" min="1" max="100" value={form.passing_score}
                  onChange={e => setForm(f => ({ ...f, passing_score: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Status</label>
                <select value={form.is_active ? 'active' : 'inactive'}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'active' }))}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Start Date/Time</label>
                <input type="datetime-local" value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">End Date/Time</label>
                <input type="datetime-local" value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Description</label>
              <textarea rows={2} value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional exam description…"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-emerald-500 transition-colors resize-none" />
            </div>
          </div>

          {/* Questions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest">
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
                    className="text-xs font-bold text-white/40 hover:text-white transition-colors px-3 py-1.5 bg-white/5 rounded-xl border border-white/10">
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
              <div key={qi} className={`border rounded-2xl overflow-hidden transition-all group ${isSelected ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-white/5 border-white/10 hover:bg-white/[0.07]'}`}>
                <div className="flex items-center justify-between px-5 py-3 bg-white/3 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    {/* Selection checkbox */}
                    <button
                      type="button"
                      onClick={() => {
                        const next = new Set(selectedQuestions);
                        if (next.has(qi)) next.delete(qi); else next.add(qi);
                        setSelectedQuestions(next);
                      }}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? 'bg-emerald-500 border-emerald-400' : 'border-white/20 hover:border-emerald-500/50'}`}
                    >
                      {isSelected && <CheckIcon className="w-3 h-3 text-white" />}
                    </button>
                    <span className="text-xs font-black text-white/30 w-6 tracking-tighter italic">#{qi + 1}</span>
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
                      className="p-1.5 text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded-lg transition-colors scale-90 opacity-40 group-hover:opacity-100 group-hover:scale-100">
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="p-5 space-y-4">

                <textarea rows={2} value={q.question_text}
                  onChange={e => updateQuestion(qi, { question_text: e.target.value })}
                  placeholder="Enter question text…"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-emerald-500 transition-colors resize-none" />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-white/40 uppercase tracking-widest mb-1">Type</label>
                    <select value={q.question_type}
                      onChange={e => updateQuestion(qi, { question_type: e.target.value, options: ['', '', '', ''], correct_answer: '' })}
                      className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer">
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="true_false">True / False</option>
                      <option value="fill_blank">Fill in Blank</option>
                      <option value="essay">Essay</option>
                    </select>
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-xs text-white/40 uppercase tracking-widest mb-1">Points</label>
                    <input type="number" min="1" value={q.points}
                      onChange={e => updateQuestion(qi, { points: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors" />
                  </div>
                  {(q.question_type === 'fill_blank' || q.question_type === 'essay') && (
                    <div className="sm:col-span-2">
                        <label className="block text-xs text-white/40 uppercase tracking-widest mb-1">Correct Answer / Scoring Guide</label>
                        <input type="text" value={q.correct_answer}
                            onChange={e => updateQuestion(qi, { correct_answer: e.target.value })}
                            placeholder={q.question_type === 'fill_blank' ? "Exact answer..." : "Grading rubric or points guide..."}
                            className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-emerald-500 transition-colors" />
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
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border font-bold transition-all ${q.correct_answer === opt ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}
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
                      <label className="block text-xs text-white/40 uppercase tracking-widest">Options (Select the correct one)</label>
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
                            className={`flex items-center gap-2 p-1.5 rounded-2xl border transition-all cursor-pointer group/opt ${isCorrect ? 'bg-emerald-500/10 border-emerald-500/50 ring-1 ring-emerald-500/20' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                          >
                            <div className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center flex-shrink-0 transition-all ${isCorrect ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'border-white/10 group-hover/opt:border-white/30 text-white/30'}`}>
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
                              className="flex-1 bg-transparent border-none px-1 py-1 text-sm text-white placeholder-white/20 focus:outline-none" 
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
              className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white/50 text-sm font-bold rounded-xl transition-colors">
              Cancel
            </Link>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-emerald-900/20">
              {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
              {saving ? 'Creating…' : 'Create Exam'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
