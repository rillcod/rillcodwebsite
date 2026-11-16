export type WrittenPaperCopy = 'candidate' | 'teacher';

export type PrintableWrittenExam = {
  id: string;
  title: string;
  description?: string | null;
  duration_minutes?: number | null;
  passing_score?: number | null;
  max_attempts?: number | null;
  courses?: { title?: string | null } | null;
};

export type PrintableWrittenQuestion = {
  id: string;
  question_text: string;
  question_type?: string | null;
  points?: number | null;
  options?: string[] | null;
  correct_answer?: unknown;
  explanation?: string | null;
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function choiceLabel(question: PrintableWrittenQuestion): string {
  const options = Array.isArray(question.options) ? question.options : [];
  const answer = String(question.correct_answer ?? '').trim();
  const numericIndex = /^\d+$/.test(answer) ? Number(answer) : -1;
  const answerIndex = options.findIndex(option => option.trim() === answer);
  const index = answerIndex >= 0 ? answerIndex : numericIndex;
  return index >= 0 && index < options.length ? String.fromCharCode(65 + index) : answer || '—';
}

export function buildWrittenPaperHtml({
  exam,
  questions,
  copy,
  reference,
  generatedAt = new Date(),
}: {
  exam: PrintableWrittenExam;
  questions: PrintableWrittenQuestion[];
  copy: WrittenPaperCopy;
  reference: string;
  generatedAt?: Date;
}): string {
  const totalPoints = questions.reduce((sum, question) => sum + Math.max(0, Number(question.points ?? 0)), 0);
  const date = generatedAt.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });
  const candidateCopy = copy === 'candidate';

  const classify = (q: PrintableWrittenQuestion): 'objective' | 'subjective' | 'essay' => {
    const t = String(q.question_type ?? '').trim().toLowerCase();
    if (t === 'multiple_choice' || t === 'mcq' || t === 'true_false' || t === 'objective') return 'objective';
    if (t === 'essay' || t === 'long_answer') return 'essay';
    if (t === 'short_answer' || t === 'fill_in_blank' || t === 'fill_blank' || t === 'subjective') return 'subjective';
    const opts = Array.isArray(q.options) ? q.options.filter(o => o.trim()) : [];
    if (opts.length >= 2) return 'objective';
    return Number(q.points ?? 0) >= 8 ? 'essay' : 'subjective';
  };

  const objQs = questions.filter(q => classify(q) === 'objective');
  const subjQs = questions.filter(q => classify(q) === 'subjective');
  const essayQs = questions.filter(q => classify(q) === 'essay');
  const orderedQuestions = [...objQs, ...subjQs, ...essayQs];

  const renderWrittenRow = (question: PrintableWrittenQuestion, displayNum: number) => {
    const tier = classify(question);
    const options = tier === 'objective' && Array.isArray(question.options) ? question.options.filter(option => option.trim()) : [];
    const lineCount = tier === 'essay' ? 8 : 3;
    const optionRows = options.length
      ? `<ol class="options" type="A">${options.map(option => `<li>${escapeHtml(option)}</li>`).join('')}</ol>`
      : `<div class="response-lines">${Array.from({ length: lineCount }).map(() => '<span></span>').join('')}</div>`;
    return `<section class="question">
      <div class="question-number">${displayNum}.</div>
      <div class="question-body">
        <div class="question-text">${escapeHtml(question.question_text)}</div>
        ${optionRows}
      </div>
      <div class="points">${Math.max(0, Number(question.points ?? 0))} pt${Number(question.points ?? 0) === 1 ? '' : 's'}</div>
    </section>`;
  };

  let runningNum = 1;
  const sectionsHtml: string[] = [];
  if (objQs.length > 0) {
    const pts = objQs.reduce((s, q) => s + Math.max(0, Number(q.points ?? 0)), 0);
    sectionsHtml.push(`<div class="section-hdr"><span>Section A — Objective</span><span>${objQs.length} Q · ${pts} pts</span></div>`);
    objQs.forEach(q => sectionsHtml.push(renderWrittenRow(q, runningNum++)));
  }
  if (subjQs.length > 0) {
    const label = objQs.length > 0 ? 'Section B' : 'Section A';
    const pts = subjQs.reduce((s, q) => s + Math.max(0, Number(q.points ?? 0)), 0);
    sectionsHtml.push(`<div class="section-hdr"><span>${label} — Subjective &amp; Short Answer</span><span>${subjQs.length} Q · ${pts} pts</span></div>`);
    subjQs.forEach(q => sectionsHtml.push(renderWrittenRow(q, runningNum++)));
  }
  if (essayQs.length > 0) {
    const label = objQs.length > 0 && subjQs.length > 0 ? 'Section C' : (objQs.length > 0 || subjQs.length > 0 ? 'Section B' : 'Section A');
    const pts = essayQs.reduce((s, q) => s + Math.max(0, Number(q.points ?? 0)), 0);
    sectionsHtml.push(`<div class="section-hdr"><span>${label} — Essay &amp; Extended Theory</span><span>${essayQs.length} Q · ${pts} pts</span></div>`);
    essayQs.forEach(q => sectionsHtml.push(renderWrittenRow(q, runningNum++)));
  }
  const questionRows = sectionsHtml.join('');

  const markingGuide = candidateCopy ? '' : `<section class="marking-guide">
    <div class="confidential"><strong>Teacher copy · confidential</strong><span>Do not distribute this page to candidates.</span></div>
    <h2>Marking guide</h2>
    <table><thead><tr><th>#</th><th>Type</th><th>Question</th><th>Answer / guide</th><th>Points</th></tr></thead><tbody>
      ${orderedQuestions.map((question, index) => `<tr>
        <td>${index + 1}</td>
        <td><strong>${classify(question).toUpperCase()}</strong></td>
        <td>${escapeHtml(question.question_text.slice(0, 120))}${question.question_text.length > 120 ? '…' : ''}</td>
        <td><strong>${escapeHtml(choiceLabel(question))}</strong>${question.explanation ? `<br><span>${escapeHtml(question.explanation)}</span>` : ''}</td>
        <td>${Math.max(0, Number(question.points ?? 0))}</td>
      </tr>`).join('')}
    </tbody></table>
  </section>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(exam.title)} — ${candidateCopy ? 'Candidate paper' : 'Teacher copy'}</title>
  <style>
    *{box-sizing:border-box} body{margin:0;padding:0;color:#172033;background:#f1f5f9;font:12px/1.5 Arial,sans-serif}
    .screen-toolbar{position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 20px;background:#0f172a;color:#fff;border-bottom:2px solid #2563eb}
    .screen-toolbar-title{font-size:13px;font-weight:800}.screen-toolbar-actions{display:flex;gap:8px}
    .screen-btn-print{padding:7px 16px;border:none;border-radius:6px;background:#2563eb;color:#fff;font-size:12px;font-weight:800;cursor:pointer}
    .screen-btn-close{padding:7px 12px;border:1px solid #334155;border-radius:6px;background:#1e293b;color:#cbd5e1;font-size:11px;font-weight:700;cursor:pointer}
    .paper{max-width:820px;margin:16px auto 28px;background:#fff;padding:24px;box-shadow:0 10px 28px rgba(0,0,0,0.1)}
    .header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #2563eb;padding-bottom:12px;break-inside:avoid}
    .brand{font-size:20px;font-weight:800;color:#1d4ed8}.service{color:#475569}.reference{text-align:right;color:#64748b;font-size:10px}
    .title{margin:18px 0 12px;padding:14px;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff;break-inside:avoid}.title h1{margin:0;color:#1e3a8a;font-size:19px}.title p{margin:5px 0 0;color:#475569}
    .meta{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;break-inside:avoid}.meta div{padding:9px;border:1px solid #e2e8f0;border-radius:8px;text-align:center}.meta small{display:block;color:#64748b;text-transform:uppercase}.meta strong{font-size:14px}
    .identity{display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:12px;padding:11px;border:1px solid #cbd5e1;border-radius:8px;break-inside:avoid}.line{display:inline-block;width:70%;border-bottom:1px solid #334155}
    .instructions{margin-bottom:16px;padding:10px;border:1px solid #fde68a;border-radius:8px;background:#fffbeb;break-inside:avoid}.copy-label{font-weight:800;color:${candidateCopy ? '#1d4ed8' : '#b45309'};text-transform:uppercase}
    .section-hdr{display:flex;justify-content:space-between;align-items:center;margin:14px 0 8px;padding:5px 8px;background:#eff6ff;border-top:2px solid #1e3a8a;font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#1e3a8a;break-after:avoid}
    .question{display:grid;grid-template-columns:28px 1fr auto;gap:8px;break-inside:avoid;margin-bottom:9px;padding:10px;border-left:3px solid #93c5fd;background:#f8fafc}.question-number{font-weight:800;color:#1e3a8a}.question-text{font-size:12px}.points{color:#64748b;font-size:10px}.options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px 24px;margin:7px 0 0;padding-left:24px}.response-lines{display:grid;gap:14px;margin-top:14px}.response-lines span{border-bottom:1px solid #cbd5e1;height:4px}
    .marking-guide{break-before:page;margin-top:24px}.marking-guide h2{color:#166534}.confidential{display:flex;justify-content:space-between;gap:12px;padding:10px;border:1px solid #fca5a5;background:#fef2f2;color:#991b1b}table{width:100%;border-collapse:collapse}th,td{border:1px solid #dbe3ef;padding:7px;text-align:left;vertical-align:top}th{background:#1e3a8a;color:#fff}
    @media(max-width:600px){.paper{padding:14px;margin:8px}.meta{grid-template-columns:repeat(2,1fr)}.identity{grid-template-columns:1fr}.options{grid-template-columns:1fr}.header{align-items:flex-start}.brand{font-size:17px}}
    @media print{body{background:#fff;padding:0}.screen-toolbar{display:none!important}.paper{max-width:none;margin:0;padding:0;box-shadow:none}@page{size:A4;margin:12mm 11mm}}
  </style></head><body>
  <div class="screen-toolbar">
    <div class="screen-toolbar-title">${escapeHtml(exam.title)} — ${candidateCopy ? 'Candidate paper' : 'Teacher copy'}</div>
    <div class="screen-toolbar-actions">
      <button type="button" class="screen-btn-print" onclick="window.print()">🖨 Print / Save PDF</button>
      <button type="button" class="screen-btn-close" onclick="window.close()">✕ Close</button>
    </div>
  </div>
  <main class="paper">
    <header class="header"><div><div class="brand">Rillcod Technologies</div><div class="service">Academic Examination Service</div></div><div class="reference">${escapeHtml(candidateCopy ? 'Candidate paper' : 'Teacher copy')}<br>Ref: ${escapeHtml(reference)}<br>${escapeHtml(date)}</div></header>
    <section class="title"><h1>${escapeHtml(exam.title)}</h1>${exam.description ? `<p>${escapeHtml(exam.description)}</p>` : ''}${exam.courses?.title ? `<p><strong>${escapeHtml(exam.courses.title)}</strong></p>` : ''}</section>
    <section class="meta"><div><small>Duration</small><strong>${Math.max(0, Number(exam.duration_minutes ?? 0))} min</strong></div><div><small>Total points</small><strong>${totalPoints}</strong></div><div><small>Pass mark</small><strong>${Math.max(0, Number(exam.passing_score ?? 0))}%</strong></div><div><small>Questions</small><strong>${questions.length}</strong></div></section>
    <section class="identity"><div>Learner name: <span class="line"></span></div><div>ID / Class: <span class="line"></span></div></section>
    <section class="instructions"><span class="copy-label">${candidateCopy ? 'Candidate copy' : 'Teacher copy'}</span> · Answer all questions clearly. Time allowed: ${Math.max(0, Number(exam.duration_minutes ?? 0))} minutes.</section>
    ${questionRows}${markingGuide}
  </main></body></html>`;
}

export function openWrittenPaperPrint(html: string): boolean {
  const popup = window.open('', '_blank');
  if (!popup) return false;
  popup.opener = null;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 350);
  return true;
}
