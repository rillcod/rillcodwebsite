/**
 * The partnership proposal, rendered from stored data.
 *
 * Replaces the HTML that lived inside build_proposal_with_cover_and_curriculum.py,
 * where the school name, the price and the twelve-year ladder were all string
 * literals — which is why the same ladder could not be shown anywhere else in
 * the platform, and why seventeen MoU PDFs on a Desktop each encode their price
 * in the filename.
 *
 * Everything here comes from three sources and none of it is typed twice:
 *   school      → the schools row
 *   curriculum  → the published progression edition
 *   offers      → PARTNERSHIP_OFFERS, or the school's agreed terms once signed
 *
 * Print-ready A4. Rendered in an iframe for preview and printed to PDF through
 * the same browser path the school invoice already uses, so there is no headless
 * Edge and no Desktop.
 */
import { brandContact } from '@/config/brand';
import type { CurriculumProgression, ProgressionLevel } from '../curriculum';
import { levelsForScope, splitByStage } from '../curriculum';
import { PARTNERSHIP_OFFERS, offerPriceLabel, type PartnershipOffer } from '../offers';
import { AUTHORED_NARRATIVE, type ProposalNarrative } from '../proposal-narrative';
import { describeTerms, type PartnershipTerms } from '../terms';

export type ProposalInput = {
  school: { name: string; address?: string | null; city?: string | null; state?: string | null };
  curriculum: CurriculumProgression | null;
  /** Omitted for a cold proposal; present once a rate has been agreed. */
  agreedTerms?: PartnershipTerms | null;
  offers?: readonly PartnershipOffer[];
  /** Reference shown on the cover, e.g. RC-PROP-0007. */
  reference: string;
  dateLabel: string;
  preparedBy?: string | null;
  /**
   * The persuasive copy. Defaults to the authored house pitch, so a caller that
   * knows nothing about narratives still renders a complete proposal.
   */
  narrative?: ProposalNarrative;
  /**
   * Trim the curriculum to the years an offer actually covers, so a quote for
   * "Basic 1 through SS 2" does not print a year it is not selling.
   */
  scopeToOffer?: string | null;
};

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const TERM_NAMES = ['', '1st Term', '2nd Term', '3rd Term'];

function yearCard(level: ProgressionLevel): string {
  const terms = level.terms
    .map(
      (t) => `
        <div class="term">
          <div class="term-name">${esc(TERM_NAMES[t.term] || `Term ${t.term}`)}</div>
          <div class="term-focus">${esc(t.focus)}</div>
        </div>`,
    )
    .join('');

  const foot = [
    level.capstone ? `<div><span class="foot-lbl">Capstone</span> ${esc(level.capstone)}</div>` : '',
    level.portfolio ? `<div><span class="foot-lbl">Portfolio</span> ${esc(level.portfolio)}</div>` : '',
  ]
    .filter(Boolean)
    .join('');

  return `
    <article class="year">
      <header class="year-head">
        <span class="year-title">Year ${level.year_number} — ${esc(level.theme)}</span>
        <span class="year-grade">${esc(level.grade)}</span>
      </header>
      <div class="terms">${terms}</div>
      ${foot ? `<footer class="year-foot">${foot}</footer>` : ''}
    </article>`;
}

function offerRow(offer: PartnershipOffer): string {
  return `
    <tr>
      <td class="opt"><strong>Option ${esc(offer.code)}</strong><br><span class="opt-name">${esc(offer.name)}</span></td>
      <td>${esc(offer.scope)}<br><span class="muted">${esc(offer.cadence)}</span></td>
      <td class="num"><strong>${esc(offerPriceLabel(offer))}</strong></td>
      <td class="best">${esc(offer.bestFor)}</td>
    </tr>`;
}

export function buildPartnershipProposalHTML(input: ProposalInput): string {
  const offers = input.offers ?? PARTNERSHIP_OFFERS;
  const narrative = input.narrative ?? AUTHORED_NARRATIVE;
  const curriculum = input.curriculum;

  // A quote shows the years it sells. Scoping to the offer keeps the proposal
  // honest when an option stops short of SS 3.
  const scopedLevels = curriculum
    ? input.scopeToOffer
      ? levelsForScope(curriculum.levels, input.scopeToOffer)
      : curriculum.levels
    : [];
  const { primary, secondary } = splitByStage(scopedLevels);

  const location = [input.school.city, input.school.state].filter(Boolean).join(', ');
  const years = scopedLevels.length;

  // Once terms are agreed the proposal states the deal instead of the menu —
  // the same sentence the MoU prints, from the same record, so a school cannot
  // be shown two different numbers for one agreement.
  const agreed = input.agreedTerms
    ? `<section class="agreed">
         <h2>Agreed terms</h2>
         <p class="agreed-line">${esc(describeTerms(input.agreedTerms))}</p>
         <p class="muted">These terms supersede the standard options below and are the terms carried into the Memorandum of Understanding.</p>
       </section>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Coding &amp; Robotics Partnership Proposal — ${esc(input.school.name)}</title>
<style>
  @page { size: A4; margin: 14mm 13mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #fff; color: #17202e;
    font: 10.2pt/1.45 "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }

  /* Cover */
  .cover { display: flex; flex-direction: column; min-height: 262mm; }
  .cover-top { border-bottom: 3px solid #7a0606; padding-bottom: 10mm; }
  .brand { font-size: 20pt; font-weight: 700; letter-spacing: -.4px; color: #0B132B; }
  .brand-tag { color: #7a0606; font-size: 9.5pt; letter-spacing: .06em; text-transform: uppercase; margin-top: 2mm; }
  .cover-mid { flex: 1; display: flex; flex-direction: column; justify-content: center; }
  .cover-kicker { font-size: 9pt; letter-spacing: .16em; text-transform: uppercase; color: #7a0606; }
  h1 { font-size: 27pt; line-height: 1.1; margin: 3mm 0 5mm; color: #0B132B; letter-spacing: -.5px; }
  .cover-for { font-size: 14pt; font-weight: 600; }
  .cover-loc { color: #566076; margin-top: 1mm; }
  .cover-meta { display: flex; gap: 12mm; margin-top: 9mm; font-size: 9pt; color: #566076; }
  .cover-meta b { display: block; color: #17202e; font-size: 10pt; }
  .cover-foot { border-top: 1px solid #d9dee7; padding-top: 5mm; font-size: 8.6pt; color: #566076; }

  h2 { font-size: 13pt; color: #0B132B; margin: 0 0 3mm; letter-spacing: -.2px; }
  p { margin: 0 0 3mm; }
  .muted { color: #667089; font-size: 8.8pt; }

  section { margin-bottom: 7mm; }
  .rule { height: 2px; background: #7a0606; width: 16mm; margin-bottom: 3mm; }

  .why { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
  .why div { background: #f6f7f9; border-left: 2px solid #7a0606; padding: 3mm 4mm; }
  .why b { display: block; margin-bottom: 1mm; }

  table { width: 100%; border-collapse: collapse; font-size: 9.2pt; }
  th { text-align: left; background: #0B132B; color: #fff; padding: 2.6mm 3mm; font-size: 8.4pt; letter-spacing: .05em; text-transform: uppercase; }
  td { padding: 2.8mm 3mm; border-bottom: 1px solid #e3e7ee; vertical-align: top; }
  .opt { white-space: nowrap; }
  .opt-name { font-size: 8.8pt; color: #566076; }
  .num { white-space: nowrap; color: #7a0606; }
  .best { color: #3d475c; font-size: 8.9pt; }

  .agreed { background: #f7efef; border: 1px solid #e0c4c4; padding: 4mm 5mm; }
  .agreed-line { font-size: 11.5pt; font-weight: 600; color: #7a0606; margin-bottom: 2mm; }

  .years { display: grid; grid-template-columns: 1fr 1fr; gap: 3.4mm; }
  .year { border: 1px solid #dde2ea; border-radius: 2mm; overflow: hidden; break-inside: avoid; }
  .year-head { display: flex; justify-content: space-between; align-items: center; gap: 2mm; background: #0B132B; color: #fff; padding: 2.2mm 3mm; }
  .year-title { font-size: 8.9pt; font-weight: 600; line-height: 1.25; }
  .year-grade { font-size: 7.6pt; background: #7a0606; padding: .6mm 2mm; border-radius: 1mm; white-space: nowrap; }
  .terms { padding: 2.4mm 3mm; display: flex; flex-direction: column; gap: 1.8mm; }
  .term-name { font-size: 7.4pt; text-transform: uppercase; letter-spacing: .06em; color: #7a0606; }
  .term-focus { font-size: 8.7pt; color: #2c3547; }
  .year-foot { border-top: 1px solid #e8ecf2; background: #fafbfc; padding: 2.2mm 3mm; font-size: 8.3pt; color: #3d475c; display: flex; flex-direction: column; gap: .8mm; }
  .foot-lbl { color: #7a0606; font-weight: 600; text-transform: uppercase; font-size: 7.2pt; letter-spacing: .05em; margin-right: 1mm; }

  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; margin-top: 8mm; }
  .sign-box { border-top: 1px solid #17202e; padding-top: 2mm; font-size: 8.8pt; }
  .sign-box b { display: block; margin-bottom: 6mm; }
  .pagehead { display: flex; justify-content: space-between; border-bottom: 2px solid #7a0606; padding-bottom: 2.5mm; margin-bottom: 5mm; font-size: 8.6pt; color: #566076; }
  .pagehead b { color: #0B132B; }
</style>
</head>
<body>

<!-- Cover -->
<div class="page cover">
  <div class="cover-top">
    <div class="brand">${esc(brandContact.displayName ?? 'Rillcod Academy')}</div>
    <div class="brand-tag">${esc(brandContact.tagline)}</div>
  </div>

  <div class="cover-mid">
    <div class="cover-kicker">Partnership Proposal</div>
    <h1>${narrative.headline}</h1>
    <div class="cover-for">Prepared for ${esc(input.school.name)}</div>
    ${location ? `<div class="cover-loc">${esc(location)}</div>` : ''}

    <div class="cover-meta">
      <div><b>${esc(input.dateLabel)}</b>Date</div>
      <div><b>${esc(input.reference)}</b>Reference</div>
      ${years ? `<div><b>${years} school years</b>Basic 1 to SS 3</div>` : ''}
      ${input.preparedBy ? `<div><b>${esc(input.preparedBy)}</b>Prepared by</div>` : ''}
    </div>
  </div>

  <div class="cover-foot">
    ${esc(brandContact.address)}<br>
    ${esc(brandContact.phone)} · ${esc(brandContact.email)}
  </div>
</div>

<!-- Overview + commercials -->
<div class="page">
  <div class="pagehead"><span><b>Partnership Proposal</b> · ${esc(input.school.name)}</span><span>${esc(input.reference)}</span></div>

  <section>
    <div class="rule"></div>
    <h2>Why this, and why now</h2>
    <p>${esc(narrative.opening)}</p>
    <div class="why">
      ${narrative.benefits
        .map((b) => `<div><b>${esc(b.title)}</b>${esc(b.body)}</div>`)
        .join('\n      ')}
    </div>
  </section>

  ${agreed}

  <section>
    <div class="rule"></div>
    <h2>${input.agreedTerms ? 'Standard options for reference' : 'Choose the shape that fits your school'}</h2>
    <table>
      <thead>
        <tr><th>Option</th><th>Who it covers</th><th>Fee</th><th>Best for</th></tr>
      </thead>
      <tbody>
        ${offers.map(offerRow).join('')}
      </tbody>
    </table>
    <p class="muted" style="margin-top:3mm">Fees are per student per term. The programme runs on the school calendar, and billing follows the same terms your school already invoices on.</p>
  </section>

  <section>
    <div class="rule"></div>
    <h2>What each side brings</h2>
    <table>
      <thead><tr><th>Rillcod Academy provides</th><th>${esc(input.school.name)} provides</th></tr></thead>
      <tbody>
        <tr>
          <td>Trained facilitators for every session · full curriculum and lesson materials · robotics kits and devices · the learning platform, logins and reporting · termly progress reports for parents</td>
          <td>A classroom or lab for the session · a slot on the timetable · student registration and parent communication · a staff contact for scheduling</td>
        </tr>
      </tbody>
    </table>
  </section>
</div>

${
  primary.length
    ? `<div class="page">
  <div class="pagehead"><span><b>Primary Pathway</b> · Basic 1 to Basic 6</span><span>${esc(curriculum?.title ?? '')}</span></div>
  <section>
    <div class="rule"></div>
    <h2>What a primary child learns, year by year</h2>
    <p class="muted">Each year carries a theme, three termly focuses, a capstone build and a portfolio target.</p>
  </section>
  <div class="years">${primary.map(yearCard).join('')}</div>
</div>`
    : ''
}

${
  secondary.length
    ? `<div class="page">
  <div class="pagehead"><span><b>Secondary Pathway</b> · JSS 1 to SS 3</span><span>${esc(curriculum?.title ?? '')}</span></div>
  <section>
    <div class="rule"></div>
    <h2>What a secondary student learns, year by year</h2>
    <p class="muted">By SS 3 a student has shipped a mobile AI product and can speak to how it was built.</p>
  </section>
  <div class="years">${secondary.map(yearCard).join('')}</div>

  <section style="margin-top:7mm">
    <div class="rule"></div>
    <h2>Next step</h2>
    <p>${esc(narrative.closing)}</p>
    <div class="sign">
      <div class="sign-box"><b>For Rillcod Academy</b>Name, signature and date</div>
      <div class="sign-box"><b>For ${esc(input.school.name)}</b>Name, signature and date</div>
    </div>
  </section>
</div>`
    : ''
}

</body>
</html>`;
}
