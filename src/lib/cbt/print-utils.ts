/** Shared helpers for CBT exam print sheets (create page + exam detail). */

export function escapeHtml(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Normalize options from DB JSONB, AI output, or form state into plain strings. */
export function normalizeCbtOptions(options: unknown, questionType?: string | null): string[] {
  const trueFalseFallback = () =>
    (questionType ?? '').toLowerCase() === 'true_false' ? ['True', 'False'] : [];

  if (options == null) return trueFalseFallback();
  if (typeof options === 'string') {
    const trimmed = options.trim();
    if (!trimmed) return trueFalseFallback();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        return normalizeCbtOptions(JSON.parse(trimmed), questionType);
      } catch {
        return [trimmed];
      }
    }
    return [trimmed];
  }
  if (Array.isArray(options)) {
    const list = options
      .map((o) => {
        if (typeof o === 'string') return o;
        if (o && typeof o === 'object') {
          const obj = o as Record<string, unknown>;
          if (typeof obj.text === 'string') return obj.text;
          if (typeof obj.label === 'string') return obj.label;
          if (typeof obj.value === 'string') return obj.value;
        }
        return String(o ?? '');
      })
      .map((s) => s.trim())
      .filter(Boolean);
    return list.length ? list : trueFalseFallback();
  }
  if (typeof options === 'object') {
    const list = Object.values(options as Record<string, unknown>)
      .map((v) => String(v ?? '').trim())
      .filter(Boolean);
    return list.length ? list : trueFalseFallback();
  }
  return trueFalseFallback();
}

export function isObjectiveQuestion(q: {
  question_type?: string | null;
  options?: unknown;
}): boolean {
  const type = (q.question_type ?? '').toLowerCase();
  if (type === 'multiple_choice' || type === 'true_false') return true;
  return normalizeCbtOptions(q.options, type).length > 0;
}

export function isTheoryQuestion(q: {
  question_type?: string | null;
  options?: unknown;
}): boolean {
  return !isObjectiveQuestion(q);
}

/** Convert markdown-ish question text to safe print HTML. */
export function mdToPrintHtml(text: string, compact = false): string {
  return renderMarkdownHtml(text, compact ? SCREEN_STYLES.compact : SCREEN_STYLES.print, compact);
}

/** Same renderer tuned for in-app display (take exam, review, detail). */
export function mdToScreenHtml(text: string): string {
  return renderMarkdownHtml(text, SCREEN_STYLES.screen);
}

const SCREEN_STYLES = {
  print: {
    body: '10.5pt',
    bodyCompact: '10pt',
    list: '10pt',
    listCompact: '9pt',
    codeBg: '#f7f7f7',
    codeColor: '#111',
    codeBorder: '#444',
    codeFont: '8pt',
    codePad: '4pt 6pt',
    codeMargin: '3pt 0 4pt',
    inlineCodeBg: '#f2f2f2',
    inlineCodeColor: '#111',
    inlineCodeBorder: '#cfcfcf',
    heading: '#111',
    quoteBg: '#f8f8f8',
    quoteBorder: '#555',
    text: '#111',
  },
  compact: {
    body: '10pt',
    bodyCompact: '9.5pt',
    list: '9pt',
    listCompact: '8.5pt',
    codeBg: '#f7f7f7',
    codeColor: '#111',
    codeBorder: '#444',
    codeFont: '7.6pt',
    codePad: '3pt 5pt',
    codeMargin: '2pt 0 3pt',
    inlineCodeBg: '#f2f2f2',
    inlineCodeColor: '#111',
    inlineCodeBorder: '#cfcfcf',
    heading: '#111',
    quoteBg: '#f8f8f8',
    quoteBorder: '#555',
    text: '#111',
  },
  screen: {
    body: '1rem',
    bodyCompact: '0.95rem',
    list: '0.95rem',
    listCompact: '0.9rem',
    codeBg: '#0f172a',
    codeColor: '#e2e8f0',
    codeBorder: '#10b981',
    codeFont: '0.8rem',
    codePad: '10px 12px',
    codeMargin: '8px 0',
    inlineCodeBg: 'rgba(16,185,129,0.12)',
    inlineCodeColor: '#6ee7b7',
    inlineCodeBorder: 'rgba(16,185,129,0.25)',
    heading: '#6ee7b7',
    quoteBg: 'rgba(16,185,129,0.08)',
    quoteBorder: '#10b981',
    text: 'inherit',
  },
} as const;

type MdStyles = {
  body: string;
  bodyCompact: string;
  list: string;
  listCompact: string;
  codeBg: string;
  codeColor: string;
  codeBorder: string;
  codeFont: string;
  codePad: string;
  codeMargin: string;
  inlineCodeBg: string;
  inlineCodeColor: string;
  inlineCodeBorder: string;
  heading: string;
  quoteBg: string;
  quoteBorder: string;
  text: string;
};

function renderMarkdownHtml(text: string, styles: MdStyles, compact = false): string {
  const fs = compact ? styles.listCompact : styles.list;
  const esc = escapeHtml;

  const codeBlocks: string[] = [];
  const t = (text ?? '').replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
    const langLabel = lang
      ? `<span style="font-size:0.65rem;font-weight:700;color:${styles.codeBorder};text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px">${esc(lang)}</span>`
      : '';
    codeBlocks.push(
      `<div class="cbt-code-block" style="margin:${styles.codeMargin};background:${styles.codeBg};padding:${styles.codePad};border-radius:3px;border:0.8pt solid #bdbdbd;border-left:2pt solid ${styles.codeBorder};overflow-wrap:anywhere;break-inside:avoid;page-break-inside:avoid">${langLabel}<pre style="margin:0;font-family:'Courier New',Consolas,'Liberation Mono',monospace;font-size:${styles.codeFont};color:${styles.codeColor};white-space:pre-wrap;word-break:break-word;line-height:1.38">${esc(code.replace(/\s+$/, ''))}</pre></div>`,
    );
    return `\x00C${codeBlocks.length - 1}\x00`;
  });

  const lines = t.split('\n');
  const out: string[] = [];
  let i = 0;

  const inl = (raw: string): string => {
    let s = esc(raw);
    s = s.replace(/\x00C(\d+)\x00/g, (_, idx) => codeBlocks[parseInt(idx, 10)] ?? '');
    return s
      .replace(/`([^`\n]+)`/g, `<code style="font-family:'Courier New',Consolas,monospace;font-size:0.85em;background:${styles.inlineCodeBg};color:${styles.inlineCodeColor};padding:2px 6px;border-radius:4px;border:1px solid ${styles.inlineCodeBorder}">$1</code>`)
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/~~(.+?)~~/g, '<s>$1</s>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" style="color:${styles.codeBorder};text-decoration:underline">$1</a>`);
  };

  while (i < lines.length) {
    const ln = lines[i];

    if (/^### /.test(ln)) {
      out.push(`<div style="font-size:0.95rem;font-weight:800;color:${styles.heading};margin:10px 0 4px;text-transform:uppercase;letter-spacing:0.04em">${inl(ln.slice(4))}</div>`);
      i++;
      continue;
    }
    if (/^## /.test(ln)) {
      out.push(`<div style="font-size:1.05rem;font-weight:800;color:${styles.heading};margin:10px 0 6px;border-bottom:1px solid ${styles.inlineCodeBorder};padding-bottom:4px">${inl(ln.slice(3))}</div>`);
      i++;
      continue;
    }
    if (/^# /.test(ln)) {
      out.push(`<div style="font-size:1.15rem;font-weight:800;color:${styles.heading};margin:12px 0 6px">${inl(ln.slice(2))}</div>`);
      i++;
      continue;
    }
    if (/^> /.test(ln)) {
      const qs: string[] = [];
      while (i < lines.length && /^> /.test(lines[i])) {
        qs.push(lines[i].slice(2));
        i++;
      }
      out.push(`<div style="border-left:3px solid ${styles.quoteBorder};background:${styles.quoteBg};padding:8px 12px;margin:8px 0;font-size:${fs};font-style:italic">${inl(qs.join(' '))}</div>`);
      continue;
    }
    if (/^---+$/.test(ln.trim())) {
      out.push('<hr style="border:none;border-top:1px solid rgba(128,128,128,0.25);margin:10px 0"/>');
      i++;
      continue;
    }
    if (/^[-*] /.test(ln)) {
      const its: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        its.push(lines[i].slice(2));
        i++;
      }
      out.push(`<ul style="margin:6px 0 6px 18px;padding:0;list-style:disc">${its.map((it) => `<li style="font-size:${fs};line-height:1.6;margin-bottom:4px">${inl(it)}</li>`).join('')}</ul>`);
      continue;
    }
    if (/^\d+\. /.test(ln)) {
      const its: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        its.push(lines[i].replace(/^\d+\. /, ''));
        i++;
      }
      out.push(`<ol style="margin:6px 0 6px 18px;padding:0;list-style:decimal">${its.map((it) => `<li style="font-size:${fs};line-height:1.6;margin-bottom:4px">${inl(it)}</li>`).join('')}</ol>`);
      continue;
    }
    if (/^\x00C\d+\x00$/.test(ln.trim())) {
      const idx = parseInt(ln.trim().replace(/\x00C(\d+)\x00/, '$1'), 10);
      out.push(codeBlocks[idx] ?? '');
      i++;
      continue;
    }
    if (!ln.trim()) {
      out.push(`<div style="height:${compact ? '2px' : '6px'}"></div>`);
      i++;
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length
      && lines[i].trim()
      && !/^#{1,3} /.test(lines[i])
      && !/^[-*] /.test(lines[i])
      && !/^\d+\. /.test(lines[i])
      && !/^> /.test(lines[i])
      && !/^---+$/.test(lines[i].trim())
      && !/^\x00C/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) {
      const bodySize = compact ? styles.bodyCompact : styles.body;
      out.push(`<div style="font-size:${bodySize};line-height:1.65;color:${styles.text}">${inl(para.join(' '))}</div>`);
    }
  }
  return out.join('');
}

export const OPT_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export function renderPrintOptions(
  options: unknown,
  opts?: { staffMode?: boolean; correctAnswer?: string | null; questionType?: string | null },
): string {
  const list = normalizeCbtOptions(options, opts?.questionType);
  if (!list.length) return '';

  const correct = (opts?.correctAnswer ?? '').trim().toLowerCase();
  const useTwoCol = list.every((o) => o.length < 72 && !o.includes('```') && !o.includes('\n'));
  const layout = useTwoCol
    ? 'display:grid;grid-template-columns:1fr 1fr;gap:2.5pt 10pt;margin:3pt 0 0 22pt'
    : 'display:flex;flex-direction:column;gap:2.5pt;margin:3pt 0 0 22pt';

  return `<div class="options" style="${layout}">
    ${list
      .map((opt, oi) => {
        const label = OPT_LABELS[oi] ?? String(oi + 1);
        const isCorrect = opts?.staffMode && (
          opt.trim().toLowerCase() === correct
          || label.toLowerCase() === correct
        );
        return `<div class="opt" style="display:flex;align-items:flex-start;gap:4pt;font-size:9.15pt;line-height:1.34;break-inside:avoid;${isCorrect ? 'font-weight:700' : ''}">
          <span style="display:inline-flex;align-items:center;justify-content:center;min-width:12.5pt;height:12.5pt;border:0.9pt solid #111;border-radius:50%;font-size:7.2pt;font-weight:900;flex-shrink:0;background:#fff">${label}</span>
          <span style="flex:1;min-width:0">${mdToPrintHtml(opt, true)}</span>
          ${isCorrect ? '<span style="font-weight:900;font-size:8pt">✓</span>' : ''}
        </div>`;
      })
      .join('')}
  </div>`;
}

export type CbtPrintQuestion = {
  question_text: string;
  question_type?: string | null;
  options?: unknown;
  correct_answer?: string | null;
  points?: number | null;
};

export type CbtPrintSheetConfig = {
  title: string;
  schoolName: string;
  subtitle?: string;
  description?: string;
  durationMinutes: number;
  passingScore: number;
  dateStr: string;
  docRef: string;
  logoUrl: string;
  mcqQuestions: CbtPrintQuestion[];
  theoryQuestions: CbtPrintQuestion[];
  mode: 'student' | 'staff';
  examTypeLabel?: string;
};

function theoryLineCount(q: CbtPrintQuestion): number {
  if (q.question_type === 'essay') return 8;
  if (q.question_type === 'fill_blank') return 3;
  return 6;
}

function hasCodeBlock(value: unknown): boolean {
  return typeof value === 'string' && /```|<pre|<code/i.test(value);
}

function codeFitsPrintColumn(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const fencedBlocks = Array.from(value.matchAll(/```(?:\w*)\n?([\s\S]*?)```/g), match => match[1] ?? '');
  if (fencedBlocks.length === 0) return !/<pre|<code/i.test(value);

  return fencedBlocks.every((block) => {
    const lines = block.replace(/\s+$/, '').split('\n');
    const nonEmptyLines = lines.filter(line => line.trim()).length;
    const longestLine = lines.reduce((max, line) => Math.max(max, line.replace(/\t/g, '  ').length), 0);
    return nonEmptyLines <= 8 && longestLine <= 42 && block.length <= 360;
  });
}

function needsFullWidthPrintBlock(q: CbtPrintQuestion): boolean {
  const text = q.question_text ?? '';
  const options = normalizeCbtOptions(q.options, q.question_type);
  return (
    (hasCodeBlock(text) && !codeFitsPrintColumn(text))
    || text.length > 260
    || options.some((option) => (
      (hasCodeBlock(option) && !codeFitsPrintColumn(option))
      || option.length > 120
    ))
  );
}

function canUsePrintColumns(questions: CbtPrintQuestion[]): boolean {
  return questions.length >= 6 && questions.every((q) => {
    const options = normalizeCbtOptions(q.options, q.question_type);
    return (
      isObjectiveQuestion(q)
      && options.length > 0
    );
  });
}

function renderPrintQuestionBlock(q: CbtPrintQuestion, num: number, mode: 'student' | 'staff'): string {
  const opts = normalizeCbtOptions(q.options, q.question_type);
  const isMCQ = isObjectiveQuestion(q) && opts.length > 0;
  const pts = q.points ?? 1;
  const widthClass = needsFullWidthPrintBlock(q) ? ' q-wide' : '';
  return `<div class="q-block${widthClass}">
    <div class="q-row">
      <span class="q-num">${num}.</span>
      <div class="q-body">
        <div class="q-text">${mdToPrintHtml(q.question_text ?? '')}</div>
        ${isMCQ
          ? renderPrintOptions(opts, { staffMode: mode === 'staff', correctAnswer: q.correct_answer, questionType: q.question_type })
          : `<div class="ans-lines">${Array.from({ length: theoryLineCount(q) }).map(() => '<div class="ans-line"></div>').join('')}</div>`}
      </div>
      <span class="q-pts">[${pts}]</span>
    </div>
  </div>`;
}

function formalInstructionsHtml(cfg: CbtPrintSheetConfig, totalMarks: number, hasMcq: boolean, hasTheory: boolean): string {
  const extra = cfg.description ? `<p class="instr-extra">${escapeHtml(cfg.description)}</p>` : '';
  const sectionRules = [
    hasMcq ? 'Objective: circle one letter only.' : null,
    hasTheory ? 'Theory: write legibly in blue or black ink.' : null,
  ].filter(Boolean).join(' ');
  return `<div class="instructions">
    <div class="instr-title">Candidate Instructions</div>
    <p><strong>1.</strong> Complete your details and answer <strong>ALL</strong> questions. Total: <strong>${totalMarks}</strong> marks · Time: <strong>${cfg.durationMinutes} min</strong> · Pass: <strong>${cfg.passingScore}%</strong>.</p>
    <p><strong>2.</strong> ${sectionRules} No phones, smart watches, or unauthorised materials; stop immediately when instructed.</p>
    ${extra}
  </div>`;
}

/** Compact A4 examination paper + optional staff marking guide. */
export function buildCbtPrintHtml(cfg: CbtPrintSheetConfig): string {
  const mcq = cfg.mcqQuestions;
  const theory = cfg.theoryQuestions;
  const totalQ = mcq.length + theory.length;
  const mcqPts = mcq.reduce((s, q) => s + (q.points ?? 0), 0);
  const theoryPts = theory.reduce((s, q) => s + (q.points ?? 0), 0);
  const totalMarks = mcqPts + theoryPts;
  const examLabel = cfg.examTypeLabel ?? 'EXAMINATION';

  const mcqColumns = canUsePrintColumns(mcq);
  const mcqHtml = mcq.length
    ? `<div class="section-hdr"><span class="s-title">Section A — Objective</span><span class="s-pts">${mcq.length} Q · ${mcqPts} marks</span></div>
       <div class="${mcqColumns ? 'q-columns' : 'q-list'}">${mcq.map((q, i) => renderPrintQuestionBlock(q, i + 1, cfg.mode)).join('')}</div>`
    : '';

  const theoryHtml = theory.length
    ? `<div class="section-hdr"><span class="s-title">Section B — Theory</span><span class="s-pts">${theory.length} Q · ${theoryPts} marks</span></div>
       <div class="q-list">${theory.map((q, i) => renderPrintQuestionBlock(q, mcq.length + i + 1, cfg.mode)).join('')}</div>`
    : '';

  const allQuestions = [...mcq, ...theory];
  const answerKeyRows = allQuestions.map((q, i) => {
    const opts = normalizeCbtOptions(q.options, q.question_type);
    const showMcq = isObjectiveQuestion(q) && opts.length > 0;
    const idx = showMcq ? opts.findIndex((o) => o.trim().toLowerCase() === (q.correct_answer ?? '').trim().toLowerCase()) : -1;
    const letter = idx >= 0 ? (OPT_LABELS[idx] ?? '—') : '—';
    const short = (q.question_text ?? '').replace(/```[\s\S]*?```/g, '[code]').replace(/`[^`]+`/g, '`…`');
    return `<tr>
      <td class="c">${i + 1}</td>
      <td>${escapeHtml(short.length > 55 ? short.slice(0, 55) + '…' : short)}</td>
      <td class="c"><strong>${showMcq ? letter : '—'}</strong></td>
      <td>${escapeHtml(q.correct_answer ?? '—')}</td>
      <td class="c">${q.points ?? 1}</td>
    </tr>`;
  }).join('');

  const staffPage = cfg.mode === 'staff' ? `
<div class="page-break ak-page">
  <div class="official-hdr compact-hdr">
    <img src="${cfg.logoUrl}" class="hdr-logo" onerror="this.style.display='none'"/>
    <div class="hdr-org"><div class="hdr-school">${escapeHtml(cfg.schoolName)}</div><div class="hdr-brand">Marking Scheme — Staff Only · Confidential</div></div>
  </div>
  <div class="ak-warn">⚠ Do not distribute to candidates before or during the examination.</div>
  <table class="ak-tbl">
    <thead><tr><th>#</th><th>Question</th><th>Key</th><th>Expected Answer</th><th>Pts</th></tr></thead>
    <tbody>${answerKeyRows}</tbody>
    <tfoot><tr><td colspan="4" class="r"><strong>TOTAL</strong></td><td class="c"><strong>${totalMarks}</strong></td></tr></tfoot>
  </table>
  <div class="sig-row">
    <div class="sig-block"><span class="sig-label">Examiner / Facilitator</span></div>
    <div class="sig-block"><span class="sig-label">Coordinator</span></div>
    <div class="sig-block"><span class="sig-label">HOD / Stamp</span></div>
  </div>
</div>` : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>${escapeHtml(cfg.title)}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Times New Roman',Georgia,serif;font-size:10.5pt;color:#000;background:#fff}
@page{size:A4 portrait;margin:8mm 9mm}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
.official-hdr{display:flex;align-items:center;gap:10pt;padding-bottom:6pt;border-bottom:2.5pt double #000;margin-bottom:5pt}
.compact-hdr{margin-bottom:4pt}
.hdr-logo{width:40pt;height:40pt;object-fit:contain;flex-shrink:0}
.hdr-org{flex:1;text-align:center}
.hdr-school{font-size:11.5pt;font-weight:900;text-transform:uppercase;letter-spacing:1px;line-height:1.15}
.hdr-brand{font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#444;margin-top:2pt}
.hdr-type{background:#000;color:#fff;padding:4pt 8pt;font-size:7pt;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;flex-shrink:0}
.title-band{text-align:center;margin:5pt 0 4pt}
.exam-title{font-size:12.5pt;font-weight:900;text-transform:uppercase;letter-spacing:0.5px}
.exam-sub{font-size:8pt;color:#444;margin-top:2pt}
.meta-grid{display:grid;grid-template-columns:repeat(5,1fr);border:1pt solid #000;margin:4pt 0;font-size:8.3pt}
.meta-cell{padding:2.5pt 4pt;border-right:1pt solid #aaa;text-align:center}
.meta-cell:last-child{border-right:none}
.meta-label{font-size:6pt;font-weight:900;text-transform:uppercase;color:#666;display:block}
.meta-val{font-size:9pt;font-weight:700;display:block;margin-top:1pt}
.stu-box{display:grid;grid-template-columns:2.2fr 1fr 1fr 0.8fr;border:1pt solid #000;margin:4pt 0}
.stu-field{padding:3pt 5pt 2.5pt;border-right:1pt solid #aaa}
.stu-field:last-child{border-right:none}
.stu-label{font-size:6pt;font-weight:900;text-transform:uppercase;color:#555;display:block;margin-bottom:3pt}
.stu-line{border-bottom:1pt solid #333;height:11pt}
.instructions{border:1pt solid #999;border-left:3pt solid #000;background:#f8f8f8;padding:3pt 6pt;margin:3pt 0 5pt;font-size:8pt;line-height:1.3}
.instr-title{font-size:6.5pt;font-weight:900;text-transform:uppercase;letter-spacing:1px;margin-bottom:2pt}
.instructions p{margin:0 0 1.5pt}
.instr-extra{margin-top:2pt!important;font-style:italic;color:#333}
.section-hdr{display:flex;align-items:center;gap:6pt;margin:6pt 0 4pt;border-top:1pt solid #000;padding-top:3pt}
.s-title{font-size:8.5pt;font-weight:900;text-transform:uppercase;letter-spacing:1px}
.s-pts{font-size:8pt;color:#444;margin-left:auto}
.q-list{display:block}
.q-columns{position:relative;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:5pt 15pt}
.q-columns::before{content:"";position:absolute;top:0;bottom:0;left:50%;border-left:0.85pt solid #999;box-shadow:1.5pt 0 0 #f2f2f2;transform:translateX(-50%)}
.q-columns .q-block{position:relative;z-index:1;break-inside:avoid;page-break-inside:avoid;margin-bottom:0;background:#fff}
.q-columns .q-wide{grid-column:1 / -1;padding:3pt 0 4pt;border-top:0.6pt solid #d7d7d7;border-bottom:0.6pt solid #e5e5e5}
.q-block{margin-bottom:6pt;break-inside:auto;page-break-inside:auto}
.q-row{display:flex;gap:5pt;align-items:flex-start}
.q-num{font-weight:900;min-width:16pt;font-size:10.2pt;line-height:1.25;flex-shrink:0;color:#111}
.q-body{flex:1;min-width:0}
.q-text{font-size:10pt;line-height:1.42;color:#111;font-weight:500}
.q-text strong{font-weight:900}
.q-pts{font-size:7pt;color:#555;font-style:italic;flex-shrink:0;padding-top:2pt}
.ans-lines{margin:3pt 0 0 20pt}
.ans-line{border-bottom:0.6pt solid #bbb;height:15pt;margin-bottom:0}
.cbt-code-block{max-width:100%}
.page-footer{margin-top:8pt;border-top:0.5pt solid #ccc;padding-top:3pt;display:flex;justify-content:space-between;font-size:7pt;color:#666}
.score-box{border:1pt solid #000;display:flex;margin-top:10pt;break-inside:avoid}
.score-cell{flex:1;padding:4pt 6pt;border-right:1pt solid #aaa;text-align:center}
.score-cell:last-child{border-right:none}
.score-label{font-size:6pt;font-weight:900;text-transform:uppercase;color:#666;display:block;margin-bottom:5pt}
.score-space{height:12pt;border-bottom:1pt solid #333}
.page-break{page-break-before:always}
.ak-warn{background:#fef2f2;border:1pt solid #fca5a5;padding:5pt 8pt;font-size:8pt;color:#7f1d1d;margin-bottom:8pt}
.ak-tbl{width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:10pt}
.ak-tbl th,.ak-tbl td{border:1pt solid #bbb;padding:3pt 5pt;text-align:left}
.ak-tbl th{background:#eee;font-size:7pt;text-transform:uppercase;font-weight:900}
.ak-tbl .c{text-align:center}
.ak-tbl .r{text-align:right}
.sig-row{display:flex;gap:16pt;margin-top:12pt}
.sig-block{flex:1;border-top:1pt solid #333;padding-top:3pt}
.sig-label{font-size:7pt;font-weight:900;text-transform:uppercase;color:#555}
</style></head><body>
<div class="official-hdr">
  <img src="${cfg.logoUrl}" class="hdr-logo" onerror="this.style.display='none'"/>
  <div class="hdr-org">
    <div class="hdr-school">${escapeHtml(cfg.schoolName)}</div>
    <div class="hdr-brand">Rillcod Technologies · Coding &amp; STEM Academy · www.rillcod.com</div>
  </div>
  <div class="hdr-type">${examLabel}</div>
</div>
<div class="title-band">
  <div class="exam-title">${escapeHtml(cfg.title)}</div>
  ${cfg.subtitle ? `<div class="exam-sub">${escapeHtml(cfg.subtitle)}</div>` : ''}
</div>
<div class="meta-grid">
  <div class="meta-cell"><span class="meta-label">Duration</span><span class="meta-val">${cfg.durationMinutes} min</span></div>
  <div class="meta-cell"><span class="meta-label">Total Marks</span><span class="meta-val">${totalMarks}</span></div>
  <div class="meta-cell"><span class="meta-label">Pass Mark</span><span class="meta-val">${cfg.passingScore}%</span></div>
  <div class="meta-cell"><span class="meta-label">Questions</span><span class="meta-val">${totalQ}</span></div>
  <div class="meta-cell"><span class="meta-label">Date</span><span class="meta-val">${escapeHtml(cfg.dateStr)}</span></div>
</div>
<div class="stu-box">
  <div class="stu-field"><span class="stu-label">Student Full Name</span><div class="stu-line"></div></div>
  <div class="stu-field"><span class="stu-label">Class / Grade</span><div class="stu-line"></div></div>
  <div class="stu-field"><span class="stu-label">Adm. No.</span><div class="stu-line"></div></div>
  <div class="stu-field"><span class="stu-label">Score</span><div class="stu-line"></div></div>
</div>
${formalInstructionsHtml(cfg, totalMarks, mcq.length > 0, theory.length > 0)}
${mcqHtml}
${theoryHtml}
<div class="score-box">
  ${mcq.length ? '<div class="score-cell"><span class="score-label">Section A</span><div class="score-space"></div></div>' : ''}
  ${theory.length ? '<div class="score-cell"><span class="score-label">Section B</span><div class="score-space"></div></div>' : ''}
  <div class="score-cell"><span class="score-label">Total</span><div class="score-space"></div></div>
  <div class="score-cell"><span class="score-label">Examiner</span><div class="score-space"></div></div>
</div>
<div class="page-footer"><span>${escapeHtml(cfg.schoolName)} · ${examLabel} · Ref ${escapeHtml(cfg.docRef)}</span><span>${escapeHtml(cfg.dateStr)}</span></div>
${staffPage}
</body></html>`;
}

export function openCbtPrintWindow(html: string): void {
  const w = window.open('', '_blank', 'width=900,height=750');
  if (!w) { alert('Pop-up blocked. Please allow pop-ups to print.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  let printed = false;
  const printWhenReady = () => {
    if (printed) return;
    printed = true;
    const doPrint = () => setTimeout(() => w.print(), 250);
    if (w.requestAnimationFrame) w.requestAnimationFrame(doPrint);
    else doPrint();
  };
  if (w.document.readyState === 'complete') {
    printWhenReady();
  } else {
    w.addEventListener('load', printWhenReady, { once: true });
    setTimeout(printWhenReady, 900);
  }
}
