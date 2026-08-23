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
  const questionRows = questions.map((question, index) => {
    const options = Array.isArray(question.options) ? question.options.filter(option => option.trim()) : [];
    const optionRows = options.length
      ? `<ol class="options" type="A">${options.map(option => `<li>${escapeHtml(option)}</li>`).join('')}</ol>`
      : '<div class="response-lines"><span></span><span></span><span></span></div>';
    return `<section class="question">
      <div class="question-number">${index + 1}.</div>
      <div class="question-body">
        <div class="question-text">${escapeHtml(question.question_text)}</div>
        ${optionRows}
      </div>
      <div class="points">${Math.max(0, Number(question.points ?? 0))} pt${Number(question.points ?? 0) === 1 ? '' : 's'}</div>
    </section>`;
  }).join('');

  const markingGuide = candidateCopy ? '' : `<section class="marking-guide">
    <div class="confidential"><strong>Teacher copy · confidential</strong><span>Do not distribute this page to candidates.</span></div>
    <h2>Marking guide</h2>
    <table><thead><tr><th>#</th><th>Question</th><th>Answer / guide</th><th>Points</th></tr></thead><tbody>
      ${questions.map((question, index) => `<tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(question.question_text.slice(0, 120))}${question.question_text.length > 120 ? '…' : ''}</td>
        <td><strong>${escapeHtml(choiceLabel(question))}</strong>${question.explanation ? `<br><span>${escapeHtml(question.explanation)}</span>` : ''}</td>
        <td>${Math.max(0, Number(question.points ?? 0))}</td>
      </tr>`).join('')}
    </tbody></table>
  </section>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(exam.title)} — ${candidateCopy ? 'Candidate paper' : 'Teacher copy'}</title>
  <style>
    *{box-sizing:border-box} body{margin:0;padding:24px;color:#172033;background:#fff;font:12px/1.5 Arial,sans-serif}
    .paper{max-width:820px;margin:0 auto}.header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #2563eb;padding-bottom:12px}
    .brand{font-size:20px;font-weight:800;color:#1d4ed8}.service{color:#475569}.reference{text-align:right;color:#64748b;font-size:10px}
    .title{margin:18px 0 12px;padding:14px;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff}.title h1{margin:0;color:#1e3a8a;font-size:19px}.title p{margin:5px 0 0;color:#475569}
    .meta{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}.meta div{padding:9px;border:1px solid #e2e8f0;border-radius:8px;text-align:center}.meta small{display:block;color:#64748b;text-transform:uppercase}.meta strong{font-size:14px}
    .identity{display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:12px;padding:11px;border:1px solid #cbd5e1;border-radius:8px}.line{display:inline-block;width:70%;border-bottom:1px solid #334155}
    .instructions{margin-bottom:16px;padding:10px;border:1px solid #fde68a;border-radius:8px;background:#fffbeb}.copy-label{font-weight:800;color:${candidateCopy ? '#1d4ed8' : '#b45309'};text-transform:uppercase}
    .question{display:grid;grid-template-columns:28px 1fr auto;gap:8px;break-inside:avoid;margin-bottom:9px;padding:10px;border-left:3px solid #93c5fd;background:#f8fafc}.question-number{font-weight:800;color:#1e3a8a}.question-text{font-size:12px}.points{color:#64748b;font-size:10px}.options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px 24px;margin:7px 0 0;padding-left:24px}.response-lines{display:grid;gap:9px;margin-top:12px}.response-lines span{border-bottom:1px solid #cbd5e1}
    .marking-guide{break-before:page;margin-top:24px}.marking-guide h2{color:#166534}.confidential{display:flex;justify-content:space-between;gap:12px;padding:10px;border:1px solid #fca5a5;background:#fef2f2;color:#991b1b}table{width:100%;border-collapse:collapse}th,td{border:1px solid #dbe3ef;padding:7px;text-align:left;vertical-align:top}th{background:#1e3a8a;color:#fff}
    @media(max-width:600px){body{padding:12px}.meta{grid-template-columns:repeat(2,1fr)}.identity{grid-template-columns:1fr}.options{grid-template-columns:1fr}.header{align-items:flex-start}.brand{font-size:17px}}
    @media print{body{padding:0}.paper{max-width:none}@page{size:A4;margin:14mm}}
  </style></head><body><main class="paper">
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
