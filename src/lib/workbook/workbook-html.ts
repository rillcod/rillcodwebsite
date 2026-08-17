/**
 * The printed workbook, as A4 pages a printer can take.
 *
 * Same discipline as the partnership documents: every page is exactly
 * 210 × 297mm, and overflow is clipped rather than spilled, so a page that runs
 * long loses its last line silently. `check-page-fit` is the only thing that
 * sees it, which is why the workbook is registered there too.
 *
 * The one rule this template has that the others do not: **two inks**. A page
 * is either colour, at ₦80, or one-colour, at ₦40, and the mono pages are
 * written against a stylesheet that has no colour in it at all. Not "muted
 * colour" — none. `greyscale.ts` checks the rendered output and fails the build
 * if a hue appears on a mono page, because the failure otherwise arrives as two
 * hundred printed copies in which the warning box and the well-done box are the
 * same grey.
 *
 * Colour lives in exactly two places: the four cover pages, and one eight-page
 * signature bound into the middle. Eight because that is one printer's
 * signature, so it is a single insert rather than colour scattered through the
 * book at the printer's inconvenience and our expense.
 */
import { brandContact } from '@/config/brand';
import type { ProgressionLevel } from '@/lib/partnerships/curriculum';
import { glossaryFor, sessionsForTerm, FOR_THE_PARENT, HOW_THIS_BOOK_WORKS } from './content';
import { MONO_INK_END, MONO_INK_START } from './greyscale';
import {
  COLOUR_SIGNATURE_PAGES,
  TEACHING_WEEKS_PER_TERM,
  money,
  planWorkbook,
  type WorkbookPlan,
} from './plan';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type WorkbookInput = {
  level: ProgressionLevel;
  schoolName?: string | null;
  /** One class a week or two. The book is as long as the teaching is. */
  sessionsPerWeek?: 1 | 2;
  academicYear?: string | null;
};

/* -------------------------------------------------------------------------- */
/* Mono building blocks                                                       */
/*                                                                            */
/* Every helper below is greyscale by construction. Nothing in here may take a */
/* colour argument, which is the cheapest way to make the guard in             */
/* greyscale.ts pass by design rather than by inspection.                      */
/* -------------------------------------------------------------------------- */

/** Ruled lines for a child to write on. Wide, because the hand is six years old. */
function ruledLines(count: number): string {
  return `<div class="lines">${Array.from({ length: count }, () => '<span class="line"></span>').join('')}</div>`;
}

/** A bordered area for a drawing. */
function drawBox(label: string): string {
  return `<div class="drawbox"><span class="drawbox-label">${esc(label)}</span></div>`;
}

/** A two-column grid for compare/contrast work. */
function twoColumnGrid(left: string, right: string): string {
  return `<div class="grid2">
    <div class="grid2-col"><span class="grid2-head">${esc(left)}</span>${ruledLines(5)}</div>
    <div class="grid2-col"><span class="grid2-head">${esc(right)}</span>${ruledLines(5)}</div>
  </div>`;
}

/** The tick box that closes every working page. A parent looks for these. */
function doneBox(): string {
  return `<div class="done"><span class="done-box"></span><span class="done-label">I finished this page</span>
    <span class="done-sign">Teacher</span></div>`;
}

function monoPage(title: string, eyebrow: string, body: string, footer: string): string {
  return `<section class="page page-mono">
    <header class="m-head">
      <span class="m-eyebrow">${esc(eyebrow)}</span>
      <h2 class="m-title">${esc(title)}</h2>
    </header>
    <div class="m-body">${body}</div>
    <footer class="m-foot">${esc(footer)}</footer>
  </section>`;
}

function colourPage(body: string): string {
  return `<section class="page page-colour">${body}</section>`;
}

/* -------------------------------------------------------------------------- */

function frontCover(plan: WorkbookPlan, input: WorkbookInput): string {
  return colourPage(`
    <div class="cov">
      <div class="cov-top">
        <div class="cov-brand">${esc(brandContact.displayName)}</div>
        <div class="cov-year">Year ${plan.yearNumber} of 12</div>
      </div>
      <div class="cov-mid">
        <div class="cov-grade">${esc(plan.grade)}</div>
        <h1 class="cov-title">${esc(plan.theme)}</h1>
        <p class="cov-sub">Coding &amp; artificial intelligence · my activity book</p>
      </div>
      <div class="cov-name">
        <label>This book belongs to</label>
        <div class="cov-rule"></div>
        <label>My school</label>
        <div class="cov-rule">${input.schoolName ? `<span class="cov-filled">${esc(input.schoolName)}</span>` : ''}</div>
      </div>
    </div>`);
}

function insideFrontCover(): string {
  return colourPage(`
    <div class="cov-inner">
      <h2 class="ci-title">How this book works</h2>
      <ol class="ci-list">
        ${HOW_THIS_BOOK_WORKS.map((line) => `<li>${esc(line)}</li>`).join('')}
      </ol>
      <div class="ci-note">
        <b>Look for this</b>
        <p>A tick box at the bottom of every page. Fill it in when the page is done.</p>
      </div>
    </div>`);
}

function journeyPage(plan: WorkbookPlan, level: ProgressionLevel): string {
  return colourPage(`
    <div class="cov-inner">
      <h2 class="ci-title">Your year: ${esc(plan.theme)}</h2>
      <p class="ci-lede">Three terms, one big build at the end of each. Here is where you are going.</p>
      <div class="journey">
        ${level.terms
          .slice(0, 3)
          .map(
            (t, i) => `<div class="jstep">
              <span class="jnum">${i + 1}</span>
              <div><b>Term ${t.term}</b><p>${esc(t.focus)}</p></div>
            </div>`,
          )
          .join('')}
        <div class="jstep jstep-end">
          <span class="jnum">★</span>
          <div><b>Your big build</b><p>${esc(level.capstone ?? 'A project you finish and show')}</p></div>
        </div>
      </div>
    </div>`);
}

function conceptPage(title: string, lede: string, points: string[]): string {
  return colourPage(`
    <div class="cov-inner">
      <h2 class="ci-title">${esc(title)}</h2>
      <p class="ci-lede">${esc(lede)}</p>
      <div class="concepts">
        ${points.map((p) => `<div class="concept-card">${esc(p)}</div>`).join('')}
      </div>
    </div>`);
}

function galleryPage(title: string, items: string[]): string {
  return colourPage(`
    <div class="cov-inner">
      <h2 class="ci-title">${esc(title)}</h2>
      <div class="gallery">
        ${items
          .map(
            (item, i) => `<div class="gal-item"><span class="gal-num">${i + 1}</span><p>${esc(item)}</p></div>`,
          )
          .join('')}
      </div>
    </div>`);
}

function termOpener(term: { term: number; focus: string }, sessions: number): string {
  return monoPage(
    `Term ${term.term}`,
    'A new term',
    `<p class="m-lede">${esc(term.focus)}</p>
     <div class="m-panel">
       <b>What happens this term</b>
       <p>${sessions} sessions. Each one has its own page. Work through them in order.</p>
     </div>
     <div class="m-panel">
       <b>My goal for this term</b>
       ${ruledLines(3)}
     </div>`,
    `Term ${term.term}`,
  );
}

function sessionPage(
  session: { term: number; session: number; today: string; tryIt: string; writeIt: string; workspace: string },
  label: string,
): string {
  const workspace =
    session.workspace === 'box'
      ? drawBox('Draw here')
      : session.workspace === 'grid'
        ? twoColumnGrid('What was hard', 'What I will change')
        : ruledLines(7);

  return monoPage(
    session.today,
    label,
    `<div class="m-step"><span class="m-step-n">1</span><div><b>Try it</b><p>${esc(session.tryIt)}</p></div></div>
     <div class="m-step"><span class="m-step-n">2</span><div><b>Write it down</b><p>${esc(session.writeIt)}</p></div></div>
     ${workspace}
     ${doneBox()}`,
    `Term ${session.term} · ${label}`,
  );
}

function termCapstonePage(termNumber: number, capstone: string | null): string {
  return monoPage(
    `Term ${termNumber} build`,
    'Show what you made',
    `<p class="m-lede">${esc(capstone ?? 'Finish your project and show it to the class.')}</p>
     <div class="m-panel"><b>What I made</b>${ruledLines(4)}</div>
     <div class="m-panel"><b>The hardest part</b>${ruledLines(3)}</div>
     ${drawBox('Draw your finished build')}
     ${doneBox()}`,
    `Term ${termNumber} build`,
  );
}

function glossaryPage(words: string[]): string {
  return monoPage(
    'Words I learned',
    'My glossary',
    `<p class="m-lede">Write what each word means in your own words. Not the teacher’s words — yours.</p>
     <div class="glossary">
       ${words
         .map((w) => `<div class="gl-row"><span class="gl-word">${esc(w)}</span><span class="gl-line"></span></div>`)
         .join('')}
     </div>`,
    'My glossary',
  );
}

function portfolioPage(level: ProgressionLevel): string {
  return monoPage(
    'My portfolio log',
    'Everything I built',
    `<p class="m-lede">${esc(level.portfolio ?? 'List everything you finished this year.')}</p>
     <table class="plog">
       <thead><tr><th>What I built</th><th>Term</th><th>Date</th><th>Shown to</th></tr></thead>
       <tbody>${Array.from({ length: 10 }, () => '<tr><td></td><td></td><td></td><td></td></tr>').join('')}</tbody>
     </table>`,
    'My portfolio log',
  );
}

function insideBackCover(level: ProgressionLevel): string {
  return colourPage(`
    <div class="cov-inner">
      <h2 class="ci-title">For the parent</h2>
      <ul class="ci-plain">${FOR_THE_PARENT.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <div class="ci-note">
        <b>By the end of this year</b>
        <p>${esc(level.portfolio ?? 'Your child will have a portfolio of work that runs.')}</p>
      </div>
    </div>`);
}

function backCover(plan: WorkbookPlan): string {
  return colourPage(`
    <div class="cov cov-back">
      <div class="cov-mid">
        <div class="cov-grade">${esc(plan.grade)}</div>
        <h1 class="cov-title">What I built this year</h1>
      </div>
      <div class="cov-foot">
        <div class="cov-brand">${esc(brandContact.displayName)}</div>
        <p>${esc(brandContact.siteUrl)} · ${esc(brandContact.phone)}</p>
      </div>
    </div>`);
}

/**
 * The whole book, in printing order.
 *
 * Cover, colour signature, interior, back cover — which is not reading order.
 * The colour signature is bound into the middle of a finished book; it is
 * emitted as a block here because that is how it is printed, and the page-fit
 * check and the greyscale check both work on what the printer receives.
 */
export function buildWorkbookHTML(input: WorkbookInput): string {
  const { level } = input;
  const plan = planWorkbook(level, input.sessionsPerWeek ?? 1);
  const sessionsPerTerm = TEACHING_WEEKS_PER_TERM * (input.sessionsPerWeek ?? 1);
  const terms = level.terms.slice(0, 3);

  const colour = [
    frontCover(plan, input),
    insideFrontCover(),
    journeyPage(plan, level),
    conceptPage('What is a computer?', 'A machine that follows instructions — exactly, and only, the ones it is given.', [
      'It takes something in',
      'It follows your steps',
      'It puts something out',
      'It never guesses what you meant',
    ]),
    conceptPage(
      'What is artificial intelligence?',
      'A computer that learns from examples instead of being told every rule.',
      ['You show it examples', 'It finds the pattern', 'It guesses on something new', 'Sometimes it is wrong'],
    ),
    conceptPage('Inside the machine', 'The parts you will use this year, and what each one does.', [
      'A board that thinks',
      'A sensor that notices',
      'A motor that moves',
      'Wires that carry the message',
    ]),
    ...terms.map((t) =>
      galleryPage(`Term ${t.term}: what you will build`, [
        t.focus,
        'You will build it yourself',
        'You will break it and fix it',
        'You will show it to someone',
      ]),
    ),
    galleryPage(level.capstone ? `Your big build: ${level.capstone}` : 'Your big build', [
      level.capstone ?? 'A project you finish and show',
      'It uses everything you learned',
      'You present it to your class',
      'It goes in your portfolio',
    ]),
  ].slice(0, COLOUR_SIGNATURE_PAGES + 2);

  const interior: string[] = [];
  for (const term of terms) {
    interior.push(termOpener(term, sessionsPerTerm));
    for (const session of sessionsForTerm(term, sessionsPerTerm)) {
      const week = Math.ceil(session.session / (input.sessionsPerWeek ?? 1));
      interior.push(sessionPage(session, `Week ${week}`));
    }
    interior.push(termCapstonePage(term.term, level.capstone));
  }
  interior.push(glossaryPage(glossaryFor(level)));
  interior.push(portfolioPage(level));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(plan.grade)} Workbook — ${esc(plan.theme)}</title>
<style>
${STYLES}
</style>
</head>
<body>
${colour.join('\n')}
${interior.join('\n')}
${insideBackCover(level)}
${backCover(plan)}
</body>
</html>`;
}

/**
 * Two stylesheets in one, and the split is the whole design.
 *
 * `.page-mono` rules use nothing but black, white and greys — checked by
 * `findGreyscaleViolations`, which reads the rendered output rather than
 * trusting this comment. `.page-colour` rules are free to use colour because
 * those four-plus-eight pages are the ones being paid for at ₦80.
 */
const STYLES = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Inter", "Segoe UI", system-ui, sans-serif;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /*
    min-height, not height — the same rule the partnership templates use.

    A fixed height makes every page measure exactly one sheet no matter what is
    inside it, so the page-fit check reports zero clearance on all ninety-two
    pages and can never tell a page that fits from one that has silently lost
    its last ruled line. Releasing min-height lets the box grow to its content,
    which is precisely what the checker measures.
  */
  .page {
    width: 210mm; min-height: 297mm;
    padding: 16mm 15mm;
    overflow: hidden;
    position: relative;
    page-break-after: always;
    display: flex; flex-direction: column;
  }

  ${MONO_INK_START}
  /* ------------------------------------------------------------------ */
  /* MONO. One ink. Nothing between the markers may name a hue, and      */
  /* findGreyscaleViolations reads exactly this region to prove it.      */
  /* ------------------------------------------------------------------ */
  .page-mono { background: #ffffff; color: #000000; }
  .m-head { border-bottom: 2px solid #000000; padding-bottom: 3mm; margin-bottom: 6mm; }
  .m-eyebrow {
    display: block; font-size: 10pt; font-weight: 700; letter-spacing: .14em;
    text-transform: uppercase; color: #555555;
  }
  .m-title { font-size: 22pt; line-height: 1.15; margin: 2mm 0 0; font-weight: 800; color: #000000; }
  .m-body { flex: 1; display: flex; flex-direction: column; gap: 5mm; }
  .m-lede { font-size: 13pt; line-height: 1.45; margin: 0; color: #222222; }
  .m-foot {
    margin-top: auto; padding-top: 3mm; border-top: 1px solid #999999;
    font-size: 9.5pt; color: #555555;
  }

  .m-step { display: flex; gap: 4mm; align-items: flex-start; }
  .m-step-n {
    flex: none; width: 9mm; height: 9mm; border: 2px solid #000000; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 12pt; color: #000000;
  }
  .m-step b { display: block; font-size: 12.5pt; margin-bottom: 1mm; }
  .m-step p { margin: 0; font-size: 12pt; line-height: 1.4; color: #222222; }

  .m-panel { border: 2px solid #000000; border-radius: 2mm; padding: 4mm 5mm; }
  .m-panel b { display: block; font-size: 11.5pt; margin-bottom: 2mm; }
  .m-panel p { margin: 0; font-size: 11.5pt; color: #222222; }

  /*
    Wide ruled lines, and the writing area takes the whole page.

    A workbook page with the instructions at the top and nothing but white
    below the boxes is paper a school paid ₦40 for and a child cannot use.
    These stretch, and the lines distribute into whatever height is left, so
    the space goes to the person doing the work.
  */
  .lines { flex: 1; display: flex; flex-direction: column; justify-content: space-evenly; padding: 3mm 0; }
  .line { display: block; height: 0; border-bottom: 1px solid #666666; }

  .drawbox {
    flex: 1; min-height: 55mm; border: 2px dashed #666666; border-radius: 2mm;
    position: relative;
  }
  .drawbox-label {
    position: absolute; top: 3mm; left: 4mm;
    font-size: 10pt; color: #777777; font-weight: 600;
  }

  .grid2 { flex: 1; display: flex; gap: 5mm; }
  .grid2-col {
    flex: 1; border: 2px solid #000000; border-radius: 2mm; padding: 3mm 4mm;
    display: flex; flex-direction: column;
  }
  .grid2-head { display: block; font-size: 10.5pt; font-weight: 800; margin-bottom: 2mm; }

  .done {
    margin-top: auto; display: flex; align-items: center; gap: 3mm;
    border-top: 2px solid #000000; padding-top: 3mm;
  }
  .done-box { width: 8mm; height: 8mm; border: 2px solid #000000; border-radius: 1mm; }
  .done-label { font-size: 11pt; font-weight: 700; }
  .done-sign {
    margin-left: auto; font-size: 10pt; color: #555555;
    border-bottom: 1px solid #666666; padding: 0 14mm 1mm 2mm;
  }

  .glossary { display: flex; flex-direction: column; gap: 7mm; }
  .gl-row { display: flex; align-items: baseline; gap: 3mm; }
  .gl-word { font-weight: 800; font-size: 11.5pt; min-width: 42mm; }
  .gl-line { flex: 1; border-bottom: 1px solid #666666; height: 0; }

  .plog { width: 100%; border-collapse: collapse; font-size: 11pt; }
  .plog th {
    text-align: left; border: 1px solid #000000; padding: 2.5mm 3mm;
    background: #eeeeee; font-size: 10pt; text-transform: uppercase; letter-spacing: .06em;
  }
  .plog td { border: 1px solid #666666; height: 11mm; padding: 1mm 3mm; }

  ${MONO_INK_END}
  /* ------------------------------------------------------------------ */
  /* COLOUR. The cover and the eight-page signature — the pages nobody   */
  /* writes on, and the only ones printed at the higher rate.            */
  /* ------------------------------------------------------------------ */
  .page-colour { background: #0B132B; color: #ffffff; }
  .cov { flex: 1; display: flex; flex-direction: column; }
  .cov-top { display: flex; justify-content: space-between; align-items: baseline; }
  .cov-brand { font-size: 15pt; font-weight: 800; letter-spacing: -.3px; }
  .cov-year {
    font-size: 10pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
    color: #7fb2ff;
  }
  .cov-mid { flex: 1; display: flex; flex-direction: column; justify-content: center; }
  .cov-grade {
    display: inline-block; align-self: flex-start;
    background: #7a0606; color: #ffffff;
    font-size: 15pt; font-weight: 800; letter-spacing: .1em; text-transform: uppercase;
    padding: 3mm 7mm; border-radius: 2mm;
  }
  .cov-title { font-size: 40pt; line-height: 1.08; margin: 7mm 0 4mm; font-weight: 900; }
  .cov-sub { font-size: 14pt; color: #b9c6e0; margin: 0; }
  .cov-name { display: flex; flex-direction: column; gap: 2mm; }
  .cov-name label { font-size: 10pt; color: #b9c6e0; font-weight: 700; }
  .cov-rule { border-bottom: 2px solid #7fb2ff; height: 9mm; margin-bottom: 3mm; }
  .cov-filled { font-size: 13pt; font-weight: 700; }
  .cov-back .cov-foot { margin-top: auto; }
  .cov-back .cov-foot p { font-size: 10.5pt; color: #b9c6e0; margin: 1mm 0 0; }

  .cov-inner { flex: 1; display: flex; flex-direction: column; gap: 5mm; }
  .ci-title { font-size: 26pt; font-weight: 900; margin: 0; line-height: 1.12; }
  .ci-lede { font-size: 13pt; color: #b9c6e0; margin: 0; line-height: 1.45; }
  .ci-list, .ci-plain { margin: 0; padding-left: 6mm; display: flex; flex-direction: column; gap: 4mm; }
  .ci-list li, .ci-plain li { font-size: 12.5pt; line-height: 1.45; }
  .ci-plain { list-style: none; padding-left: 0; }
  .ci-note {
    margin-top: auto; background: rgba(127,178,255,.14); border-left: 4px solid #7fb2ff;
    border-radius: 2mm; padding: 4mm 5mm;
  }
  .ci-note b { display: block; font-size: 11pt; color: #7fb2ff; margin-bottom: 1.5mm; }
  .ci-note p { margin: 0; font-size: 12pt; }

  .journey { display: flex; flex-direction: column; gap: 4mm; }
  .jstep { display: flex; gap: 4mm; align-items: flex-start; background: rgba(255,255,255,.06); border-radius: 2mm; padding: 4mm 5mm; }
  .jstep-end { background: rgba(122,6,6,.4); }
  .jnum {
    flex: none; width: 11mm; height: 11mm; border-radius: 50%;
    background: #7fb2ff; color: #0B132B;
    display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 14pt;
  }
  .jstep b { font-size: 13pt; }
  .jstep p { margin: 1mm 0 0; font-size: 11.5pt; color: #b9c6e0; line-height: 1.4; }

  .concepts { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; flex: 1; align-content: center; }
  .concept-card {
    background: rgba(255,255,255,.07); border: 1px solid rgba(127,178,255,.35); border-radius: 3mm;
    padding: 7mm 5mm; font-size: 14pt; font-weight: 700; text-align: center;
    display: flex; align-items: center; justify-content: center; min-height: 34mm;
  }
  .gallery { display: flex; flex-direction: column; gap: 4mm; flex: 1; justify-content: center; }
  .gal-item { display: flex; gap: 4mm; align-items: center; background: rgba(255,255,255,.06); border-radius: 2mm; padding: 5mm; }
  .gal-num {
    flex: none; width: 10mm; height: 10mm; border-radius: 2mm; background: #7a0606;
    display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 13pt;
  }
  .gal-item p { margin: 0; font-size: 13pt; }
`;

/** A one-line summary for whoever is about to send this to a printer. */
export function describeWorkbookCost(plan: WorkbookPlan): string {
  const { cost } = plan;
  return [
    `${plan.pages.length} pages`,
    `${cost.colourPages} colour (${money(cost.colourCost)})`,
    `${cost.monoPages} mono (${money(cost.monoCost)})`,
    `binding ${money(cost.bindingCost)}`,
    `= ${money(cost.perCopy)} per copy`,
  ].join(' · ');
}
