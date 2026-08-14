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
import { brandAssets, brandContact } from '@/config/brand';
import type { CurriculumProgression, ProgressionLevel } from '../curriculum';
import { levelsForScope, levelsForStage, splitByStage, type CurriculumStage } from '../curriculum';
import { PARTNERSHIP_OFFERS, offerPriceLabel, type PartnershipOffer } from '../offers';
import { AUTHORED_NARRATIVE, type ProposalNarrative } from '../proposal-narrative';
import { approx, type ProofPoints } from '../proof-points';
import {
  DISCIPLINES,
  FIELD_PROOF,
  ROLLOUT_PHASES,
  WHY_NOW,
  type SchoolUpside,
} from '../proposal-sections';
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
  /**
   * Quote the primary half, the secondary half, or all twelve years. A primary
   * school has no use for the SS years, and reading them says we did not look.
   */
  stage?: CurriculumStage | null;
  /**
   * How long the quoted fees stand, e.g. "12 November 2026".
   *
   * A price with no expiry is a price forever: a school that returns eighteen
   * months later is holding a quote nobody meant to still honour, and the fees
   * here are the ones the MoU and then the invoice inherit.
   */
  validUntilLabel?: string | null;
  /**
   * Our own footprint, counted at issue time. Omitted rather than faked: the
   * band only prints when the numbers came back.
   */
  proof?: ProofPoints | null;
  /** What the programme is worth to this school, from its own roll. */
  upside?: SchoolUpside | null;
  /** Classroom photography. Empty renders no gallery rather than empty frames. */
  photos?: readonly string[];
};

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const TERM_NAMES = ['', '1st Term', '2nd Term', '3rd Term'];

/**
 * Absolute URL for an image.
 *
 * The document is stored and reopened long after it was issued, sometimes
 * outside the app, so a relative `/images/...` would render as a broken frame
 * wherever the page is not the dashboard. Anchoring to the public site keeps a
 * five-year-old proposal looking like the one that was sent.
 */
function assetUrl(src: string): string {
  if (/^(https?:|data:)/i.test(src)) return src;
  return `${brandContact.siteUrl.replace(/\/$/, '')}/${String(src).replace(/^\//, '')}`;
}

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

function offerRow(offer: PartnershipOffer, highlighted: boolean): string {
  // The option this quote was scoped to is called out, so a head teacher
  // reading three rows knows which one we actually put in front of them.
  return `
    <tr${highlighted ? ' class="picked"' : ''}>
      <td class="opt"><strong>Option ${esc(offer.code)}</strong>${
        highlighted ? '<span class="tag">Quoted</span>' : ''
      }<br><span class="opt-name">${esc(offer.name)}</span></td>
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
    ? levelsForStage(
        input.scopeToOffer
          ? levelsForScope(curriculum.levels, input.scopeToOffer)
          : curriculum.levels,
        input.stage,
      )
    : [];
  const { primary, secondary } = splitByStage(scopedLevels);

  const location = [input.school.city, input.school.state].filter(Boolean).join(', ');
  const years = scopedLevels.length;
  // The range is read off the years actually being sold. Printing a fixed
  // "Basic 1 to SS 3" under a scoped count contradicts the quote on its own
  // cover — Option A stops at SS 2 and said so two lines below.
  const rangeLabel = years
    ? `${scopedLevels[0].grade} to ${scopedLevels[years - 1].grade}`
    : '';

  // Once terms are agreed the proposal states the deal instead of the menu —
  // the same sentence the MoU prints, from the same record, so a school cannot
  // be shown two different numbers for one agreement.
  /**
   * The close and the place to sign.
   *
   * Built once and placed unconditionally. This used to live inside the
   * secondary-years page, so a proposal whose curriculum failed to load — which
   * `getPublishedProgression` returns as null on purpose — printed no closing
   * and, worse, no signature block at all.
   */
  const closingBlock = `
  <section>
    <div class="rule"></div>
    <h2>Next step</h2>
    <p class="quote">${esc(narrative.closing)}</p>
    <div class="contact">
      <div class="contact-l">Speak to us</div>
      <div>
        <b>${esc(brandContact.displayName)}</b><br>
        ${esc(brandContact.address)}<br>
        ${esc(brandContact.phone)} · ${esc(brandContact.email)} · ${esc(brandContact.web)}
      </div>
    </div>
    <div class="sign">
      <div class="sign-box"><b>For ${esc(brandContact.contractingParty)}</b>Name, signature and date</div>
      <div class="sign-box"><b>For ${esc(input.school.name)}</b>Name, signature and date</div>
    </div>
  </section>`;

  const photos = (input.photos ?? []).filter(Boolean);
  const gallery = photos.length
    ? `
  <section>
    <div class="rule"></div>
    <h2>The programme running</h2>
    <div class="gallery">${photos
      .slice(0, 6)
      .map((src) => `<img src="${esc(assetUrl(src))}" alt="">`)
      .join('')}</div>
  </section>`
    : '';

  /**
   * How many schools already said yes.
   *
   * Counted at issue, never typed, and omitted entirely when the counts did not
   * come back — an empty band costs a paragraph, a wrong one costs the meeting.
   */
  const proofBand = (dark: boolean): string => {
    const p = input.proof;
    if (!p) return '';
    const tiles = [
      { n: approx(p.partnerSchools), l: 'Schools partnered', c: 'c1' },
      { n: approx(p.students), l: 'Learners building', c: 'c2' },
      ...(p.years > 0 ? [{ n: String(p.years), l: 'Years of curriculum', c: 'c3' }] : []),
    ];
    return `<div class="proof${dark ? ' proof-dark' : ''}">${tiles
      .map(
        (t) =>
          `<div class="proof-tile ${t.c}"><span class="proof-n">${esc(t.n)}</span><span class="proof-l">${esc(t.l)}</span></div>`,
      )
      .join('')}</div>`;
  };

  /**
   * Four stops on the ladder, read off the years being sold.
   *
   * A head teacher does not read twelve year-cards to decide; they want to know
   * where a child starts and what they walk out holding. The detail pages are
   * still there for whoever wants them.
   */
  const journey = (): string => {
    if (scopedLevels.length < 2) return '';
    const picks = [0, Math.floor(years / 3), Math.floor((years * 2) / 3), years - 1]
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .map((i) => scopedLevels[i])
      .filter(Boolean);
    return `<div class="journey">${picks
      .map(
        (l) => `<div class="leg">
          <div class="leg-grade">${esc(l.grade)}</div>
          <div class="leg-what">${esc(l.capstone || l.theme)}</div>
        </div>`,
      )
      .join('')}</div>`;
  };

  const money = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

  /**
   * The school's share, drawn.
   *
   * Deliberately one hue for all three bars. Shading them darker-as-they-grow
   * would encode bar length twice and say nothing the length has not already
   * said. There is no hover in a printed document, so every bar carries its own
   * value at the tip and the table underneath is the accessible view.
   *
   * Inline SVG with no script and no external file, so it survives being stored,
   * reopened years later and printed.
   */
  const upsideChart = (u: SchoolUpside): string => {
    const W = 640;
    const LABEL_W = 128;
    const BAR_X = LABEL_W + 10;
    const BAR_MAX = 330;
    const ROW_H = 46;
    const BAR_H = 20;
    const R = 4;
    const top = 8;
    const max = Math.max(...u.rows.map((r) => r.schoolShare)) || 1;

    const bars = u.rows
      .map((row, i) => {
        const y = top + i * ROW_H;
        const w = Math.max(2, Math.round((row.schoolShare / max) * BAR_MAX));
        // Square where it meets the baseline, rounded at the data end.
        const r = Math.min(R, w);
        const path =
          `M${BAR_X} ${y} H${BAR_X + w - r} A${r} ${r} 0 0 1 ${BAR_X + w} ${y + r} ` +
          `V${y + BAR_H - r} A${r} ${r} 0 0 1 ${BAR_X + w - r} ${y + BAR_H} H${BAR_X} Z`;
        return `
        <text class="ch-lbl" x="${LABEL_W}" y="${y + BAR_H / 2 + 4}" text-anchor="end">${esc(row.label)}</text>
        <path d="${path}" fill="#2563eb"></path>
        <text class="ch-val" x="${BAR_X + w + 8}" y="${y + BAR_H / 2 + 4}">${esc(money(row.schoolShare))}</text>
        <text class="ch-sub" x="${BAR_X + w + 8}" y="${y + BAR_H / 2 + 14}">${row.students} students</text>`;
      })
      .join('');

    const H = top + u.rows.length * ROW_H;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="The school's ${u.sharePercent}% share per ${esc(u.cycle)} at three levels of uptake">
      <line x1="${BAR_X}" y1="${top - 4}" x2="${BAR_X}" y2="${H - ROW_H + BAR_H + 4}" stroke="#c9d0dc" stroke-width="1"></line>
      ${bars}
    </svg>`;
  };

  /**
   * The only figure on the page computed from the recipient's own numbers.
   *
   * Three uptake levels, with the arithmetic left visible, because a single
   * confident projection is the one a head teacher stops believing. This is
   * what makes the document a quote for them rather than a brochure.
   */
  /** How a fee divides. Sits with the fees, because that is the question it answers. */
  const splitBlock = (): string => {
    const u = input.upside;
    if (!u) return '';
    return `
  <section>
    <div class="rule"></div>
    <h2>How every fee divides</h2>
    <div class="splitkey">
      <span><i class="sw sw-school"></i>${esc(input.school.name)}</span>
      <span><i class="sw sw-rc"></i>${esc(brandContact.displayName)}</span>
    </div>
    <div class="split">
      <div class="seg seg-school" style="flex:${u.sharePercent}">${u.sharePercent}% to your school</div>
      <div class="seg seg-rc" style="flex:${100 - u.sharePercent}">${100 - u.sharePercent}%</div>
    </div>
    <p class="muted">Our share covers the facilitators, the robotics kits and devices, the learning platform and the termly reporting. Your share is settled against actual enrolment each ${esc(u.cycle)}.</p>
  </section>`;
  };

  const upsideBlock = (): string => {
    const u = input.upside;
    if (!u) return '';
    return `
  <section>
    <div class="rule"></div>
    <h2>What this is worth to ${esc(input.school.name)}</h2>
    <p class="muted">Worked from your own roll at ${money(u.feePerStudent)} per student per ${esc(u.cycle)}, on the standard ${u.sharePercent}% share to the school. Change the uptake assumption and the arithmetic still holds.</p>

    ${upsideChart(u)}
    <table>
      <thead>
        <tr><th>Scenario</th><th>Students enrolled</th><th>Programme fees</th><th>Your ${u.sharePercent}% share</th></tr>
      </thead>
      <tbody>
        ${u.rows
          .map(
            (r, i) => `<tr${i === u.rows.length - 1 ? ' class="picked"' : ''}>
          <td><strong>${esc(r.label)}</strong></td>
          <td>${r.students}</td>
          <td>${esc(money(r.gross))}</td>
          <td class="num"><strong>${esc(money(r.schoolShare))}</strong></td>
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>
    <p class="muted" style="margin-top:2.5mm">Per ${esc(u.cycle)}, before the additional streams a programme like this opens — tech fairs, sponsored showcases and holiday workshops.</p>
  </section>`;
  };

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

  /* Cover — this is the page that decides whether the rest gets read.
     Colour comes from flat brand blocks rather than photographs or gradients
     alone: a solid fill reproduces on any printer, and each block carries a
     fallback colour underneath in case a gradient is dropped. */
  .cover { display: flex; flex-direction: column; min-height: 262mm; }
  .cover-top {
    background: #0B132B;
    background: linear-gradient(135deg, #0B132B 0%, #17255c 58%, #4a1114 100%);
    color: #fff; margin: -14mm -13mm 0; padding: 12mm 13mm 9mm;
  }
  /* The accent rule. Three unequal segments in the brand's own colours reads as
     designed; five equal ones read as a swatch card. */
  .stripe { display: flex; height: 2.2mm; margin: 0 -13mm; }
  .s1 { background: #7a0606; flex: 6; }
  .s2 { background: #c62828; flex: 2.5; }
  .s3 { background: #2563eb; flex: 1.5; }

  .brand-row { display: flex; align-items: center; gap: 4mm; }
  .brand-mark { width: 15mm; height: 15mm; object-fit: contain; flex: none; }
  .brand { font-size: 20pt; font-weight: 700; letter-spacing: -.4px; color: #fff; }
  .brand-tag { color: #f0c9c9; font-size: 9.5pt; letter-spacing: .06em; text-transform: uppercase; margin-top: 2mm; }
  .cover-mid { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 8mm 0 6mm; }
  .cover-kicker {
    display: inline-block; align-self: flex-start; background: #7a0606; color: #fff;
    font-size: 8.2pt; letter-spacing: .14em; text-transform: uppercase; font-weight: 700;
    padding: 1.6mm 3.5mm; border-radius: 1mm;
  }
  h1 { font-size: 31pt; line-height: 1.05; margin: 5mm 0 6mm; color: #0B132B; letter-spacing: -.7px; max-width: 155mm; }
  .cover-for-card {
    background: #f4f6fb; border-left: 3.5mm solid #2563eb; padding: 4.5mm 5mm; margin-bottom: 2mm;
  }
  .cover-for { font-size: 14.5pt; font-weight: 700; color: #0B132B; }
  .cover-loc { color: #566076; margin-top: 1mm; font-size: 9.4pt; }
  .cover-meta { display: flex; flex-wrap: wrap; gap: 9mm; margin-top: 8mm; font-size: 9pt; color: #566076; }
  .cover-meta b { display: block; color: #0B132B; font-size: 10pt; }
  .cover-foot {
    border-top: 1px solid #d9dee7; padding-top: 5mm; font-size: 8.6pt; color: #566076;
  }

  /* Proof — the strongest thing on the page is how many already said yes */
  .proof { display: flex; gap: 3mm; margin: 8mm 0 0; }
  .proof-tile {
    flex: 1; background: #f6f7f9; padding: 4mm 4mm 3.5mm; text-align: center;
    border-top: 3px solid #7a0606;
  }
  .proof-tile.c1, .proof-tile.c2, .proof-tile.c3 { border-top-color: #c62828; }
  .proof-n { display: block; font-size: 22pt; font-weight: 700; color: #0B132B; letter-spacing: -.6px; line-height: 1; }
  .proof-l { display: block; font-size: 7.6pt; color: #566076; margin-top: 1.8mm; text-transform: uppercase; letter-spacing: .06em; }
  /* On the dark band the tiles invert: white numerals on a translucent panel. */
  .proof-dark .proof-tile { background: rgba(255,255,255,.10); }
  .proof-dark .proof-n { color: #fff; }
  .proof-dark .proof-l { color: #cdd6e8; }

  /* The journey — what a child actually walks out with */
  .journey { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; }
  .leg { background: #f6f7f9; padding: 3.5mm 4mm; border-left: 2px solid #7a0606; }
  .leg-grade { font-size: 7.6pt; text-transform: uppercase; letter-spacing: .07em; color: #7a0606; font-weight: 600; }
  .leg-what { font-size: 8.9pt; color: #2c3547; margin-top: 1.5mm; line-height: 1.35; }

  .quote {
    border-left: 3px solid #7a0606; padding: 1mm 0 1mm 5mm; margin: 6mm 0;
    font-size: 12pt; line-height: 1.35; color: #0B132B; font-weight: 600;
  }

  /* Disciplines — what a parent will ask "but what do they actually learn?" */
  .disc { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
  .disc div { background: #f6f7f9; padding: 3mm 4mm; border-left: 2px solid #2563eb; }
  .disc b { display: block; color: #0B132B; margin-bottom: .8mm; font-size: 9.4pt; }

  /* Rollout — three phases, because "when does it disrupt us?" is the real question */
  .phases { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
  .phase { border: 1px solid #dde2ea; border-top: 3px solid #2563eb; padding: 3.5mm 4mm; }
  .phase-when {
    font-size: 7.4pt; text-transform: uppercase; letter-spacing: .07em;
    color: #2563eb; font-weight: 700;
  }
  .phase-name { font-size: 10pt; font-weight: 700; color: #0B132B; margin: 1mm 0 1.5mm; }
  .phase-body { font-size: 8.6pt; color: #3d475c; line-height: 1.4; }

  .ticks { margin: 0; padding: 0; list-style: none; }
  .ticks li {
    position: relative; padding-left: 6mm; margin-bottom: 2mm; font-size: 9.4pt; color: #2c3547;
  }
  .ticks li:before {
    content: ""; position: absolute; left: 0; top: 1.5mm;
    width: 2.6mm; height: 2.6mm; background: #2563eb; border-radius: 50%;
  }

  .contact {
    display: flex; gap: 5mm; align-items: flex-start;
    background: #0B132B; color: #fff; padding: 4.5mm 5mm; margin: 5mm 0 0; font-size: 9pt; line-height: 1.5;
  }
  .contact-l {
    font-size: 7.6pt; text-transform: uppercase; letter-spacing: .1em;
    color: #93b8ff; font-weight: 700; white-space: nowrap; padding-top: .6mm;
  }
  .contact b { font-size: 10.5pt; }

  /* Chart. Text wears ink tokens; only the bar carries the data colour. */
  .chart { width: 100%; height: auto; display: block; margin: 4mm 0 5mm; }
  .ch-lbl { font: 600 12px "Segoe UI", system-ui, Arial, sans-serif; fill: #17202e; }
  .ch-val { font: 700 13px "Segoe UI", system-ui, Arial, sans-serif; fill: #0B132B; }
  .ch-sub { font: 400 10px "Segoe UI", system-ui, Arial, sans-serif; fill: #7b8499; }

  .gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.5mm; }
  .gallery img {
    width: 100%; height: 34mm; object-fit: cover; display: block;
    border: 1px solid #dde2ea; break-inside: avoid;
  }

  /* Every section wears the same chip. A consistent rhythm is what makes a
     document read as designed rather than assembled. */
  h2 {
    font-size: 12.5pt; color: #0B132B; margin: 0 0 3.5mm; letter-spacing: -.2px;
    background: #f4f6fb; border-left: 3.5mm solid #7a0606; padding: 2.2mm 4mm;
  }
  p { margin: 0 0 3mm; }
  .muted { color: #667089; font-size: 8.8pt; }

  section { margin-bottom: 7mm; }
  .rule { display: none; }

  /* Part-to-whole with two parts: a split bar, not a pie. Two series, so the
     legend is not optional. */
  .split { display: flex; gap: 2px; margin: 3mm 0 2mm; }
  .split .seg {
    padding: 2.6mm 3mm; color: #fff; font-size: 9pt; font-weight: 600; white-space: nowrap;
  }
  .seg-school { background: #2563eb; }
  .seg-rc { background: #c62828; }
  .splitkey { display: flex; gap: 6mm; font-size: 8.6pt; color: #566076; }
  .splitkey span { display: flex; align-items: center; gap: 1.8mm; }
  .sw { width: 3mm; height: 3mm; display: inline-block; border-radius: .6mm; }
  .sw-school { background: #2563eb; } .sw-rc { background: #c62828; }

  .why { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
  .why div { background: #f6f7f9; border-left: 2px solid #7a0606; padding: 3mm 4mm; }
  .why b { display: block; margin-bottom: 1mm; }

  table { width: 100%; border-collapse: collapse; font-size: 9.2pt; }
  th { text-align: left; background: #0B132B; color: #fff; padding: 2.6mm 3mm; font-size: 8.4pt; letter-spacing: .05em; text-transform: uppercase; }
  td { padding: 2.8mm 3mm; border-bottom: 1px solid #e3e7ee; vertical-align: top; }
  .opt { white-space: nowrap; }
  tr.picked td { background: #f7efef; }
  tr.picked .opt strong { color: #7a0606; }
  .tag {
    display: inline-block; margin-left: 2mm; background: #7a0606; color: #fff;
    font-size: 6.8pt; letter-spacing: .06em; text-transform: uppercase;
    padding: .5mm 1.6mm; border-radius: 1mm; vertical-align: middle;
  }
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
    <div class="brand-row">
      <img class="brand-mark" src="${esc(assetUrl(brandAssets.logoMono))}" alt="">
      <div>
        <div class="brand">${esc(brandContact.displayName)}</div>
        <div class="brand-tag">${esc(brandContact.tagline)}</div>
      </div>
    </div>
    ${proofBand(true)}
  </div>
  <div class="stripe"><span class="s1"></span><span class="s2"></span><span class="s3"></span></div>

  <div class="cover-mid">
    <div class="cover-kicker">Partnership Proposal</div>
    <h1>${narrative.headline}</h1>
    <div class="cover-for-card">
      <div class="cover-for">Prepared for ${esc(input.school.name)}</div>
      ${location ? `<div class="cover-loc">${esc(location)}</div>` : ''}
    </div>

    <div class="cover-meta">
      <div><b>${esc(input.dateLabel)}</b>Date</div>
      <div><b>${esc(input.reference)}</b>Reference</div>
      ${years ? `<div><b>${years} school year${years === 1 ? '' : 's'}</b>${esc(rangeLabel)}</div>` : ''}
      ${input.validUntilLabel ? `<div><b>${esc(input.validUntilLabel)}</b>Fees valid until</div>` : ''}
      ${input.preparedBy ? `<div><b>${esc(input.preparedBy)}</b>Prepared by</div>` : ''}
    </div>
  </div>

  <div class="cover-foot">
    ${esc(brandContact.registeredName)} · ${esc(brandContact.rcNumber)} · trading as ${esc(brandContact.displayName)}<br>
    ${esc(brandContact.address)}<br>
    ${esc(brandContact.phone)} · ${esc(brandContact.email)} · ${esc(brandContact.web)}
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

  ${
    journey()
      ? `<section>
    <div class="rule"></div>
    <h2>What a child walks out with</h2>
    <p class="muted">Every year ends in something built and kept, not a grade on a sheet.</p>
    ${journey()}
  </section>`
      : ''
  }

  <section>
    <div class="rule"></div>
    <h2>What we teach</h2>
    <div class="disc">
      ${DISCIPLINES.map(
        (d) => `<div><b>${esc(d.name)}</b>${esc(d.body)}</div>`,
      ).join('')}
    </div>
  </section>
</div>

<!-- Commercials -->
<div class="page">
  <div class="pagehead"><span><b>Partnership Proposal</b> · ${esc(input.school.name)}</span><span>${esc(input.reference)}</span></div>

  ${agreed}

  <section>
    <div class="rule"></div>
    <h2>${input.agreedTerms ? 'Standard options for reference' : 'Choose the shape that fits your school'}</h2>
    <table>
      <thead>
        <tr><th>Option</th><th>Who it covers</th><th>Fee</th><th>Best for</th></tr>
      </thead>
      <tbody>
        ${offers
          .map((o) => offerRow(o, !!input.scopeToOffer && o.scope === input.scopeToOffer))
          .join('')}
      </tbody>
    </table>
    <p class="muted" style="margin-top:3mm">Fees are per student per term. The programme runs on the school calendar, and billing follows the same terms your school already invoices on.${
      input.validUntilLabel
        ? ` These fees stand until ${esc(input.validUntilLabel)}; after that we will re-quote before anything is signed.`
        : ''
    }</p>
  </section>

  ${splitBlock()}
</div>

<!-- The money page. Its own sheet, because a head teacher reads this one twice. -->
<div class="page">
  <div class="pagehead"><span><b>Your return</b> · ${esc(input.school.name)}</span><span>${esc(input.reference)}</span></div>

  ${upsideBlock()}

  <section>
    <div class="rule"></div>
    <h2>What each side brings</h2>
    <table>
      <thead><tr><th>${esc(brandContact.displayName)} provides</th><th>${esc(input.school.name)} provides</th></tr></thead>
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
</div>`
    : ''
}

<!-- How it starts, and the place to say yes. Always the last page: the close
     must never depend on a section that might not render. -->
<div class="page">
  <div class="pagehead"><span><b>Getting started</b> · ${esc(input.school.name)}</span><span>${esc(input.reference)}</span></div>

  <section>
    <div class="rule"></div>
    <h2>How a rollout actually goes</h2>
    <p class="muted">The first objection is never price, it is disruption. This is the whole of it.</p>
    <div class="phases">
      ${ROLLOUT_PHASES.map(
        (p) => `<div class="phase">
        <div class="phase-when">${esc(p.when)}</div>
        <div class="phase-name">${esc(p.phase)}</div>
        <div class="phase-body">${esc(p.body)}</div>
      </div>`,
      ).join('')}
    </div>
  </section>

  <section>
    <div class="rule"></div>
    <h2>Why now</h2>
    <ul class="ticks">
      ${WHY_NOW.map((w) => `<li>${esc(w)}</li>`).join('')}
    </ul>
  </section>

  <section>
    <div class="rule"></div>
    <h2>What our students have already done</h2>
    <ul class="ticks">
      ${FIELD_PROOF.map((f) => `<li>${esc(f)}</li>`).join('')}
    </ul>
  </section>

  ${gallery}

  ${closingBlock}
</div>

</body>
</html>`;
}
