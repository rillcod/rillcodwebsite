// @refresh reset
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  AcademicCapIcon, ArrowLeftIcon, PlusIcon, PencilIcon, TrashIcon,
  CheckCircleIcon, XMarkIcon, ClockIcon, ChartBarIcon, ArrowPathIcon,
  CheckBadgeIcon, DocumentTextIcon, ArrowsUpDownIcon, LockOpenIcon, LockClosedIcon,
} from '@/lib/icons';
import { toast } from 'sonner';

interface Exam {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number | null;
  total_points: number;
  passing_score: number;
  max_attempts: number;
  is_active: boolean;
  randomize_questions: boolean;
  randomize_options: boolean;
  courses?: { id: string; title: string };
}

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  points: number;
  order_index: number;
  options: string[] | null;
  correct_answer: any;
  explanation: string | null;
}

const Q_TYPES = ['multiple_choice', 'true_false', 'short_answer', 'essay', 'fill_in_blank'];

function QuestionTypeTag({ type }: { type: string }) {
  const colors: Record<string, string> = {
    multiple_choice: 'bg-blue-500/20 text-blue-400',
    true_false: 'bg-emerald-500/20 text-emerald-400',
    short_answer: 'bg-amber-500/20 text-amber-400',
    essay: 'bg-violet-500/20 text-violet-400',
    fill_in_blank: 'bg-primary/20 text-primary',
    matching: 'bg-pink-500/20 text-pink-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${colors[type] ?? 'bg-white/10 text-card-foreground/60'}`}>
      {type.replace(/_/g, ' ')}
    </span>
  );
}

export default function ExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editQ, setEditQ] = useState<Question | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [optionCount, setOptionCount] = useState(4);

  const [qForm, setQForm] = useState({
    question_text: '',
    question_type: 'multiple_choice',
    points: 1,
    options: ['', '', '', ''],
    correct_answer: '',
    explanation: '',
  });

  const canManage = profile?.role === 'admin' || profile?.role === 'teacher';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [examRes, qRes] = await Promise.all([
        fetch(`/api/exams/${id}`),
        fetch(`/api/exams/${id}/questions`),
      ]);
      if (!examRes.ok) throw new Error('Exam not found');
      const examJson = await examRes.json();
      const qJson = qRes.ok ? await qRes.json() : { data: [] };
      setExam(examJson.data);
      setQuestions(qJson.data ?? []);
    } catch {
      toast.error('Failed to load exam');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (!authLoading && profile) load(); }, [authLoading, profile, load]);

  function openForm(q?: Question) {
    if (q) {
      setEditQ(q);
      const opts = Array.isArray(q.options) ? q.options : ['', '', '', ''];
      setOptionCount(opts.length);
      setQForm({ question_text: q.question_text, question_type: q.question_type, points: q.points, options: opts, correct_answer: String(q.correct_answer ?? ''), explanation: q.explanation ?? '' });
    } else {
      setEditQ(null);
      setOptionCount(4);
      setQForm({ question_text: '', question_type: 'multiple_choice', points: 1, options: ['', '', '', ''], correct_answer: '', explanation: '' });
    }
    setShowForm(true);
  }

  async function saveQuestion() {
    if (!qForm.question_text.trim()) { toast.error('Question text required'); return; }
    setSubmitting(true);
    try {
      const payload = {
        ...qForm,
        points: Number(qForm.points),
        options: ['multiple_choice', 'true_false'].includes(qForm.question_type) ? qForm.options.filter(Boolean) : null,
      };
      let res;
      if (editQ) {
        res = await fetch(`/api/exams/${id}/questions/${editQ.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        res = await fetch(`/api/exams/${id}/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      toast.success(editQ ? 'Question updated' : 'Question added');
      setShowForm(false);
      load();
    } catch (e: any) { toast.error(e.message || 'Failed to save question'); }
    finally { setSubmitting(false); }
  }

  async function deleteQuestion(qid: string) {
    if (!confirm('Delete this question?')) return;
    const res = await fetch(`/api/exams/${id}/questions/${qid}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Question deleted'); load(); }
    else toast.error('Failed to delete');
  }

  async function toggleActive() {
    if (!exam) return;
    await fetch(`/api/exams/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !exam.is_active }) });
    setExam(e => e ? { ...e, is_active: !e.is_active } : e);
    toast.success(`Exam ${exam.is_active ? 'deactivated' : 'activated'}`);
  }

  if (authLoading || loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!exam) return <div className="p-6 text-center text-card-foreground/50">Exam not found</div>;

  const totalPoints = questions.reduce((s, q) => s + q.points, 0);

  const handlePrintExam = () => {
    const docRef = `WRT-${Date.now().toString(36).toUpperCase()}`;
    const dateStr = new Date().toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });
    const course = exam?.courses?.title ?? '';

    const optLabels = ['A', 'B', 'C', 'D', 'E', 'F'];

    const questionRows = questions.map((q, i) => {
      const isChoice = q.question_type === 'multiple_choice';
      const opts = isChoice && Array.isArray(q.options)
        ? q.options.filter(o => o.trim()).map((o, j) => `<span style="margin-right:14px;white-space:nowrap"><b>${optLabels[j]}.</b> ${o}</span>`).join('')
        : '';
      return `<div style="break-inside:avoid;margin-bottom:10px;padding:8px;border-left:2px solid #3b82f622;background:${i % 2 === 0 ? '#fafafa' : '#fff'}">
  <div style="display:flex;align-items:flex-start;gap:8px">
    <span style="font-weight:800;font-size:12px;color:#1e3a8a;min-width:24px">${i + 1}.</span>
    <div style="flex:1">
      <div style="font-size:12px;color:#111827;line-height:1.5">${q.question_text}</div>
      ${isChoice ? `<div style="margin-top:6px;font-size:11px;color:#374151;display:flex;flex-wrap:wrap;gap:2px 0">${opts}</div>` : '<div style="margin-top:10px;border-bottom:1px solid #d1d5db;width:80%;height:1px"></div>'}
      <span style="font-size:10px;color:#9ca3af;float:right">[${q.points} pt${q.points !== 1 ? 's' : ''}]</span>
    </div>
  </div>
</div>`;
    }).join('');

    const answerRows = questions.map((q, i) => {
      const isChoice = q.question_type === 'multiple_choice';
      const optIdx = isChoice && Array.isArray(q.options) ? q.options.findIndex(o => o.trim() === String(q.correct_answer).trim() || o.trim() === q.options?.[parseInt(q.correct_answer)]) : -1;
      const label = optIdx >= 0 ? optLabels[optIdx] : (q.correct_answer || '—');
      return `<tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:4px 8px;text-align:center;font-weight:700;font-size:11px;color:#1e3a8a">${i + 1}</td>
        <td style="padding:4px 8px;font-size:10px;color:#111827">${q.question_text.slice(0, 80)}${q.question_text.length > 80 ? '...' : ''}</td>
        <td style="padding:4px 8px;text-align:center;font-weight:800;font-size:11px;color:#059669">${isChoice ? label : '—'}</td>
        <td style="padding:4px 8px;font-size:10px;color:#374151">${q.correct_answer || '—'}</td>
        <td style="padding:4px 8px;text-align:center;font-size:10px;color:#6b7280">${q.points}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${exam?.title} — Exam Sheet</title>
<style>
body{font-family:'Segoe UI',Arial,sans-serif;padding:20px;color:#111}
.header{display:flex;justify-content:space-between;border-bottom:3px solid #3b82f6;padding-bottom:10px;margin-bottom:15px}
.title-box{background:#f0f7ff;border:1px solid #3b82f644;padding:12px;margin-bottom:15px;border-radius:8px}
.meta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:15px}
.meta-cell{background:#f9fafb;border:1px solid #e5e7eb;padding:8px;text-align:center;border-radius:6px}
.meta-label{font-size:9px;color:#6b7280;text-transform:uppercase}
.meta-val{font-size:14px;font-weight:800}
.name-box{border:1px solid #d1d5db;padding:10px;margin-bottom:15px;display:flex;gap:20px;border-radius:8px}
.name-field{flex:1;border-bottom:1px solid #111;min-width:150px}
.instructions{background:#fffbeb;border:1px solid #fcd34d;padding:10px;margin-bottom:15px;font-size:11px;border-radius:8px}
.section-title{font-size:11px;font-weight:800;text-transform:uppercase;color:#1e3a8a;border-bottom:1px solid #3b82f633;padding-bottom:5px;margin-bottom:10px}
table{width:100%;border-collapse:collapse;margin-top:10px}
th{background:#1e3a8a;color:white;padding:6px;font-size:10px;text-align:left}
@media print{.no-print{display:none}}
.page-break{page-break-before:always;margin-top:20px}
</style></head><body>
<div class="header">
  <div><b style="font-size:20px;color:#3b82f6">Rillcod Technologies</b><br/><small>Academic Examination Service</small></div>
  <div style="text-align:right;font-size:10px;color:#6b7280">Ref: ${docRef}<br/>Date: ${dateStr}</div>
</div>
<div class="title-box">
  <div style="font-size:18px;font-weight:900;color:#1e3a8a">${exam?.title}</div>
  <div style="font-size:11px;color:#374151;margin-top:4px">${exam?.description || ''}</div>
  <div style="font-size:11px;color:#3b82f6;margin-top:4px;font-weight:700">${course}</div>
</div>
<div class="meta-grid">
  <div class="meta-cell"><div class="meta-label">Duration</div><div class="meta-val">${exam?.duration_minutes} min</div></div>
  <div class="meta-cell"><div class="meta-label">Total Points</div><div class="meta-val">${totalPoints}</div></div>
  <div class="meta-cell"><div class="meta-label">Pass Mark</div><div class="meta-val">${exam?.passing_score}%</div></div>
  <div class="meta-cell"><div class="meta-label">Attempts</div><div class="meta-val">${exam?.max_attempts}</div></div>
</div>
<div class="name-box">
  <div><div style="font-size:10px;color:#6b7280">Student Name:</div><div class="name-field"></div></div>
  <div><div style="font-size:10px;color:#6b7280">ID / Class:</div><div class="name-field"></div></div>
</div>
<div class="instructions"><b>Instructions:</b> Answer all questions clearly. Time allowed: ${exam?.duration_minutes} minutes.</div>
<div class="section-title">Examination Sheet</div>
${questionRows}
<div class="page-break">
  <div class="header" style="border-bottom-color:#059669"><b style="font-size:20px;color:#059669">Marking Guide</b></div>
  <div style="font-size:11px;background:#f0fdf4;border:1px solid #bbf7d0;padding:10px;margin-bottom:15px;color:#166534"><b>Confidential:</b> For examiner use only.</div>
  <table>
    <thead><tr><th>#</th><th>Question</th><th>Key</th><th>Expected Response</th><th>Pts</th></tr></thead>
    <tbody>${answerRows}</tbody>
  </table>
</div>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/dashboard/exams" className="p-2 hover:bg-white/5 rounded-xl transition-all mt-1">
          <ArrowLeftIcon className="w-5 h-5 text-card-foreground/50" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${exam.is_active ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-zinc-500/20 text-muted-foreground/70 border-zinc-500/30'}`}>
              {exam.is_active ? <LockOpenIcon className="w-3 h-3" /> : <LockClosedIcon className="w-3 h-3" />}
              {exam.is_active ? 'Active' : 'Inactive'}
            </span>
            {exam.courses && <span className="text-xs text-card-foreground/40 bg-white/5 px-2 py-0.5 rounded-full">{exam.courses.title}</span>}
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-card-foreground">{exam.title}</h1>
          {exam.description && <p className="text-card-foreground/50 text-sm mt-1">{exam.description}</p>}
        </div>
        {canManage && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={toggleActive}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${exam.is_active ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400' : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400'}`}>
              {exam.is_active ? <><LockClosedIcon className="w-3.5 h-3.5" /> Deactivate</> : <><LockOpenIcon className="w-3.5 h-3.5" /> Activate</>}
            </button>
            <Link href={`/dashboard/exams/${id}/edit`} className="p-2 hover:bg-white/5 rounded-xl transition-all">
              <PencilIcon className="w-4 h-4 text-card-foreground/50" />
            </Link>
          </div>
        )}
      </div>

      {/* Exam Config Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Duration', value: exam.duration_minutes ? `${exam.duration_minutes}m` : '—', icon: ClockIcon },
          { label: 'Total Points', value: `${totalPoints}/${exam.total_points}`, icon: ChartBarIcon },
          { label: 'Pass Score', value: `${exam.passing_score}%`, icon: CheckBadgeIcon },
          { label: 'Max Attempts', value: String(exam.max_attempts), icon: ArrowPathIcon },
        ].map(m => (
          <div key={m.label} className="bg-card border border-white/[0.08] rounded-xl p-3 text-center">
            <m.icon className="w-4 h-4 text-blue-400 mx-auto mb-1.5" />
            <p className="font-black text-card-foreground">{m.value}</p>
            <p className="text-[10px] font-bold text-card-foreground/40 uppercase tracking-wider">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Questions Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-card-foreground flex items-center gap-2">
          <DocumentTextIcon className="w-5 h-5 text-blue-400" />
          Questions ({questions.length})
        </h2>
        <div className="flex items-center gap-2">
          {questions.length > 0 && (
            <button onClick={handlePrintExam}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-card-foreground/70 font-bold rounded-xl transition-all text-sm border border-white/10">
              <DocumentTextIcon className="w-4 h-4" /> Print Sheet
            </button>
          )}
          {canManage && (
            <button onClick={() => openForm()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white font-bold rounded-xl transition-all text-sm shadow-lg shadow-blue-500/20">
              <PlusIcon className="w-4 h-4" /> Add Question
            </button>
          )}
        </div>
      </div>

      {/* Questions List */}
      {questions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 bg-card border border-white/[0.08] rounded-2xl">
          <DocumentTextIcon className="w-14 h-14 text-card-foreground/10" />
          <p className="text-card-foreground/40 font-semibold">No questions yet</p>
          {canManage && <button onClick={() => openForm()} className="text-blue-400 text-sm font-bold hover:underline">Add the first question</button>}
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q, idx) => (
            <div key={q.id} className="bg-card border border-white/[0.08] rounded-2xl p-4 hover:border-blue-500/20 transition-all group">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center justify-center text-xs font-black text-blue-400 flex-shrink-0 mt-0.5">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <QuestionTypeTag type={q.question_type} />
                    <span className="text-xs text-card-foreground/40 font-bold">{q.points} pt{q.points !== 1 ? 's' : ''}</span>
                  </div>
                  <p className="text-card-foreground text-sm font-medium">{q.question_text}</p>
                  {Array.isArray(q.options) && q.options.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className={`text-xs flex items-center gap-2 px-2 py-1 rounded-lg ${String(q.correct_answer) === String(oi) || q.correct_answer === opt ? 'bg-emerald-500/10 text-emerald-400 font-bold' : 'text-card-foreground/50'}`}>
                          {String(q.correct_answer) === String(oi) || q.correct_answer === opt ? <CheckCircleIcon className="w-3 h-3 flex-shrink-0" /> : <span className="w-3 h-3 flex-shrink-0" />}
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}
                  {q.explanation && <p className="text-xs text-card-foreground/40 mt-2 italic">Explanation: {q.explanation}</p>}
                </div>
                {canManage && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openForm(q)} className="p-1.5 hover:bg-white/10 rounded-lg transition-all">
                      <PencilIcon className="w-3.5 h-3.5 text-card-foreground/50" />
                    </button>
                    <button onClick={() => deleteQuestion(q.id)} className="p-1.5 hover:bg-rose-500/20 rounded-lg transition-all">
                      <TrashIcon className="w-3.5 h-3.5 text-rose-400" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Question Form Modal */}
      {showForm && canManage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-white/[0.12] rounded-2xl w-full max-w-2xl shadow-2xl my-4">
            <div className="flex items-center justify-between p-5 border-b border-white/[0.08]">
              <h3 className="font-black text-card-foreground text-lg">{editQ ? 'Edit Question' : 'Add Question'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-white/5 rounded-lg"><XMarkIcon className="w-5 h-5 text-card-foreground/50" /></button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Type */}
              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Question Type</label>
                <div className="flex flex-wrap gap-2">
                  {Q_TYPES.map(t => (
                    <button key={t} onClick={() => setQForm(f => ({ ...f, question_type: t }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${qForm.question_type === t ? 'bg-blue-500 text-white' : 'bg-white/5 text-card-foreground/60 hover:bg-white/10'}`}>
                      {t.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Question text */}
              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Question Text</label>
                <textarea value={qForm.question_text} onChange={e => setQForm(f => ({ ...f, question_text: e.target.value }))} rows={3}
                  placeholder="Enter your question here…"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-blue-500/50 resize-none" />
              </div>

              {/* Points */}
              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Points</label>
                <input type="number" min={1} value={qForm.points} onChange={e => setQForm(f => ({ ...f, points: Number(e.target.value) }))}
                  className="w-28 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-blue-500/50" />
              </div>

              {/* Options for MCQ / T-F */}
              {['multiple_choice', 'true_false'].includes(qForm.question_type) && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-card-foreground/50 uppercase">Answer Options</label>
                    {qForm.question_type === 'multiple_choice' && (
                      <button onClick={() => { setOptionCount(n => n + 1); setQForm(f => ({ ...f, options: [...f.options, ''] })); }}
                        className="text-xs text-blue-400 font-bold hover:underline">+ Add option</button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {qForm.question_type === 'true_false' ? (
                      ['True', 'False'].map((opt, i) => (
                        <label key={opt} className="flex items-center gap-3 cursor-pointer">
                          <input type="radio" name="correct" checked={qForm.correct_answer === opt}
                            onChange={() => setQForm(f => ({ ...f, options: ['True', 'False'], correct_answer: opt }))} />
                          <span className="text-sm text-card-foreground">{opt}</span>
                        </label>
                      ))
                    ) : (
                      qForm.options.slice(0, optionCount).map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input type="radio" name="correct" checked={qForm.correct_answer === String(i)}
                            onChange={() => setQForm(f => ({ ...f, correct_answer: String(i) }))} />
                          <input value={opt} onChange={e => setQForm(f => ({ ...f, options: f.options.map((o, oi) => oi === i ? e.target.value : o) }))}
                            placeholder={`Option ${i + 1}`}
                            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-blue-500/50" />
                        </div>
                      ))
                    )}
                  </div>
                  <p className="text-[10px] text-card-foreground/30 mt-1">Select the correct answer using the radio button</p>
                </div>
              )}

              {/* Correct answer for short_answer / fill_in_blank */}
              {['short_answer', 'fill_in_blank'].includes(qForm.question_type) && (
                <div>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Expected Answer</label>
                  <input value={qForm.correct_answer} onChange={e => setQForm(f => ({ ...f, correct_answer: e.target.value }))}
                    placeholder="Enter the expected answer…"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-blue-500/50" />
                </div>
              )}

              {/* Explanation */}
              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Explanation (optional)</label>
                <input value={qForm.explanation} onChange={e => setQForm(f => ({ ...f, explanation: e.target.value }))}
                  placeholder="Explain the correct answer…"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-blue-500/50" />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-white/[0.08]">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-card-foreground/70 font-bold rounded-xl transition-all">Cancel</button>
              <button onClick={saveQuestion} disabled={submitting || !qForm.question_text.trim()}
                className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white font-bold rounded-xl transition-all">
                {submitting ? 'Saving…' : editQ ? 'Update' : 'Add Question'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
