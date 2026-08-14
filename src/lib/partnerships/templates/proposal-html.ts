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
import { defaultStudioConfig, type ProposalStudioConfig } from '../studio-config';

export type ProposalInput = {
  school: { name: string; address?: string | null; city?: string | null; state?: string | null };
  curriculum: CurriculumProgression | null;
  /** Omitted for a cold proposal; present once a rate has been agreed. */
  agreedTerms?: PartnershipTerms | null;
  offers?: readonly PartnershipOffer[];
  /** Reference shown on the cover, e.g. RC-PROP-0007. */
  reference: string;
  dateLabel: string;
  /**
   * Deliberately absent. The masthead and the footer both name the company, so
   * a third "Prepared by Rillcod Technologies" only orphaned a fifth item onto
   * its own row and broke the meta line.
   */
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
  /**
   * What the studio decided this school should see, and in whose words.
   * Absent means the complete document, which is what every caller that
   * predates the studio expects.
   */
  studio?: ProposalStudioConfig | null;
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
  // Photographs come off a phone with names like "WhatsApp Image … (1).jpeg".
  // Spaces and brackets are not valid in a URL, and an unencoded one is a broken
  // frame on the page that is supposed to be the evidence.
  const encoded = String(src)
    .replace(/^\//, '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${brandContact.siteUrl.replace(/\/$/, '')}/${encoded}`;
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

/**
 * One option, as a card.
 *
 * This was a four-column table. At readable body type the "best for" column
 * collapsed to roughly one word per line and the whole thing became a puzzle —
 * four columns simply do not fit across A4 once the type is large enough to
 * read comfortably. A card gives each option the full width and puts the price
 * where the eye lands first.
 */
function offerCard(offer: PartnershipOffer, highlighted: boolean): string {
  return `
    <article class="offer${highlighted ? ' offer-picked' : ''}">
      <header class="offer-top">
        <div>
          <span class="offer-code">Option ${esc(offer.code)}</span>
          ${highlighted ? '<span class="tag">Quoted</span>' : ''}
          <span class="offer-name">${esc(offer.name)}</span>
        </div>
        <div class="offer-price">${esc(offerPriceLabel(offer))}</div>
      </header>
      <div class="offer-meta">${esc(offer.scope)} &nbsp;·&nbsp; ${esc(offer.cadence)}</div>
      <p class="offer-best">${esc(offer.bestFor)}</p>
    </article>`;
}

export function buildPartnershipProposalHTML(input: ProposalInput): string {
  // Every section asks this before drawing itself. Defaulting to the complete
  // document means a caller that knows nothing about the studio still gets a
  // whole proposal.
  const studio = input.studio ?? defaultStudioConfig(input.photos ?? []);
  const on = (key: keyof typeof studio.sections) => studio.sections[key] !== false;

  const offers = input.offers ?? PARTNERSHIP_OFFERS;
  const base = input.narrative ?? AUTHORED_NARRATIVE;
  const narrative = {
    ...base,
    headline: studio.copy.headline || base.headline,
    opening: studio.copy.opening || base.opening,
    closing: studio.copy.closing || base.closing,
  };
  const curriculum = input.curriculum;

  /**
   * Does the overview need two sheets?
   *
   * "Who you would be partnering with" and "Why this, and why now" used to share
   * one page. Both are now full arguments — company, mission, vision and proof on
   * one side; the opening and four reasons on the other — and together they run
   * roughly 400px past what A4 holds. The print rule pins a page to 297mm and
   * hides the overflow, so that is not a page that scrolls: it is a page that
   * silently loses the last reason.
   *
   * Split only when both are actually printing. With either switched off in the
   * studio, a second sheet would come out blank.
   */
  const splitOverview = on('intro') && on('pitch');

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

  const photos = on('photos') ? (studio.photos ?? []).filter(Boolean) : [];

  /**
   * A strip of photographs, from a slice of the chosen set.
   *
   * All six used to print together on the closing page. That left the reasons
   * ending halfway down one sheet and the signature block floating halfway down
   * another — the "plain at the bottom" that makes a proposal look unfinished.
   * Three after the claims and three above the signature fills both, and puts
   * evidence in front of the reader twice: once where we assert, once where they
   * sign.
   */
  const galleryStrip = (from: number, heading: string, large = false): string => {
    const slice = photos.slice(from, from + 3);
    if (!slice.length) return '';
    return `
  <section>
    <div class="rule"></div>
    <h2>${esc(heading)}</h2>
    <div class="gallery${large ? ' gallery-lg' : ''}">${slice
      .map((src) => `<img src="${esc(assetUrl(src))}" alt="">`)
      .join('')}</div>
  </section>`;
  };

  /**
   * The track record.
   *
   * Prints beside the company introduction when the overview has two sheets —
   * "who you would be partnering with" is exactly the question this answers, and
   * that page has the room. On the single-sheet layout it stays where it was,
   * before the close.
   */
  const fieldProofSection = `  <section>
    <div class="rule"></div>
    <h2>What our students have already done</h2>
    <ul class="ticks">
      ${FIELD_PROOF.map((f) => `<li>${esc(f)}</li>`).join('')}
    </ul>
  </section>`;

  /** Everything, for the layout that still prints one strip. */
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
    if (!p || !on('proofBand')) return '';
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
    if (scopedLevels.length < 2 || !on('journey')) return '';
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
    if (!u || !on('split')) return '';
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
    if (!u || !on('upside')) return '';

    // Each shape gets the sentence that describes its own arithmetic. A section
    // breakdown says the share is taken on each section and added, because that
    // is the sum a bursar will do by hand to check it.
    const lead =
      u.mode === 'illustrative'
        ? `We do not have your enrolment on file yet, so this is the same arithmetic at three common school sizes. Tell us your roll and we will restate it exactly — the rate and the ${u.sharePercent}% share do not change.`
        : u.mode === 'sections'
        ? `Your ${u.sharePercent}% is taken on each section at its own agreed rate, and the sections are added. Nothing here is averaged or estimated.`
        : u.mode === 'package'
          ? `The agreed package for the school, and your ${u.sharePercent}% of it, per ${esc(u.cycle)}.`
          : `Worked from your own roll at ${money(u.feePerStudent)} per student per ${esc(u.cycle)}, on the standard ${u.sharePercent}% share to the school. Change the uptake assumption and the arithmetic still holds.`;

    const firstCol =
      u.mode === 'sections' ? 'Section'
      : u.mode === 'package' ? 'Agreed'
      : u.mode === 'illustrative' ? 'School size'
      : 'Scenario';
    const showRate = u.mode === 'sections';

    const bodyRow = (r: (typeof u.rows)[number], highlight: boolean) => `
        <tr${highlight ? ' class="picked"' : ''}>
          <td><strong>${esc(r.label)}</strong></td>
          <td>${r.students}</td>
          ${showRate ? `<td>${r.rate ? esc(money(r.rate)) : '—'}</td>` : ''}
          <td>${esc(money(r.gross))}</td>
          <td class="num"><strong>${esc(money(r.schoolShare))}</strong></td>
        </tr>`;

    return `
  <section>
    <div class="rule"></div>
    <h2>What this is worth to ${esc(input.school.name)}</h2>
    <p class="muted">${lead}</p>

    ${upsideChart(u)}
    <table>
      <thead>
        <tr>
          <th>${firstCol}</th>
          <th>Students</th>
          ${showRate ? '<th>Rate each</th>' : ''}
          <th>Programme fees</th>
          <th>Your ${u.sharePercent}% share</th>
        </tr>
      </thead>
      <tbody>
        ${u.rows.map((r, i) => bodyRow(r, !u.total && i === u.rows.length - 1)).join('')}
        ${u.total ? bodyRow(u.total, true) : ''}
      </tbody>
    </table>
    <p class="muted" style="margin-top:2.5mm">Per ${esc(u.cycle)}, before the additional streams a programme like this opens — tech fairs, sponsored showcases and holiday workshops.</p>
  </section>`;
  };

  /**
   * The three options, compared on what a parent pays over a full year.
   *
   * Per-term figures are what we quote, but a school decides in sessions — and
   * three prices in three different sentences are hard to weigh against each
   * other. One hue, because these are three values of one measure, and every bar
   * carries its own figure since a printed page has no hover.
   */
  const offersChart = (): string => {
    if (!on('offersChart')) return '';
    const W = 640, LABEL_W = 150, BAR_X = LABEL_W + 10, BAR_MAX = 300, ROW_H = 44, BAR_H = 19, R = 4, top = 8;
    const rows = offers.map((o) => ({
      code: o.code,
      // Three terms to a session, at the entry price of the range.
      year: o.priceFrom * 3,
      label: 'Option ' + o.code,
    }));
    const max = Math.max(...rows.map((r) => r.year)) || 1;
    const bars = rows.map((r, i) => {
      const y = top + i * ROW_H;
      const w = Math.max(2, Math.round((r.year / max) * BAR_MAX));
      const rr = Math.min(R, w);
      const path = 'M' + BAR_X + ' ' + y + ' H' + (BAR_X + w - rr) +
        ' A' + rr + ' ' + rr + ' 0 0 1 ' + (BAR_X + w) + ' ' + (y + rr) +
        ' V' + (y + BAR_H - rr) + ' A' + rr + ' ' + rr + ' 0 0 1 ' + (BAR_X + w - rr) + ' ' + (y + BAR_H) +
        ' H' + BAR_X + ' Z';
      return '<text class="ch-lbl" x="' + LABEL_W + '" y="' + (y + BAR_H / 2 + 4) + '" text-anchor="end">' + esc(r.label) + '</text>' +
        '<path d="' + path + '" fill="#2563eb"></path>' +
        '<text class="ch-val" x="' + (BAR_X + w + 8) + '" y="' + (y + BAR_H / 2 + 4) + '">' + esc(money(r.year)) + '</text>' +
        '<text class="ch-sub" x="' + (BAR_X + w + 8) + '" y="' + (y + BAR_H / 2 + 14) + '">per student, per year</text>';
    }).join('');
    const H = top + rows.length * ROW_H;
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Yearly cost per student for each option">' +
      '<line x1="' + BAR_X + '" y1="' + (top - 4) + '" x2="' + BAR_X + '" y2="' + (H - ROW_H + BAR_H + 4) + '" stroke="#cbd5e1" stroke-width="1"></line>' +
      bars + '</svg>';
  };

  /**
   * What the child hands back, counted from the ladder being sold.
   *
   * Every level carries a portfolio target — "3 Scratch Games + 1 AI Story" —
   * so the evidence a parent ends up holding is already in the curriculum and
   * does not need asserting separately. Scoping the quote changes this block
   * with it, because it is the same list of years.
   */
  const portfolioBlock = (): string => {
    const withPortfolio = scopedLevels.filter((l) => (l.portfolio ?? "").trim());
    if (withPortfolio.length < 2) return '';
    const first = withPortfolio[0];
    const last = withPortfolio[withPortfolio.length - 1];
    return `
  <section>
    <div class="rule"></div>
    <h2>What a parent gets to hold</h2>
    <p class="muted">Not a report saying it went well — the work itself, kept and added to every year. Taken from the progression below, so this is the actual list for the years being quoted.</p>
    <div class="parent">
      <div>
        <div class="parent-when">${esc(first.grade)} — the first year</div>
        <div class="parent-what">${esc(first.portfolio)}</div>
        <div class="parent-body">Finished work in the first twelve months, so a parent sees the point of it before they are asked to keep paying for it.</div>
      </div>
      <div>
        <div class="parent-when">Every term after</div>
        <div class="parent-what">${withPortfolio.length} years of capstone builds</div>
        <div class="parent-body">Each year closes on something that works — a robot, a game, an app — and a written progress report in the format your school already reports in.</div>
      </div>
      <div>
        <div class="parent-when">${esc(last.grade)} — leaving</div>
        <div class="parent-what">${esc(last.portfolio)}</div>
        <div class="parent-body">A portfolio of shipped work, which is what a university admissions officer or a first employer actually asks to see.</div>
      </div>
    </div>
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  
  html { background: #0f172a; }
  body {
    margin: 0; padding: 24px 0; background: #0f172a; color: #1e293b;
    font: 11.4pt/1.55 "Inter", system-ui, -apple-system, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    display: flex; flex-direction: column; align-items: center; gap: 24px;
  }
  
  .page {
    width: 210mm; min-height: 297mm; padding: 14mm 13mm;
    background: #ffffff; color: #1e293b;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
    border-radius: 2px; position: relative; box-sizing: border-box;
    overflow: hidden;
  }

  @media print {
    html, body { background: #ffffff !important; padding: 0 !important; gap: 0 !important; display: block !important; }
    .page {
      width: 210mm !important; height: 297mm !important; min-height: 297mm !important;
      padding: 14mm 13mm !important; box-shadow: none !important; border-radius: 0 !important;
      page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid;
    }
    .page:last-child { page-break-after: auto; break-after: auto; }
  }

  h1, h2, h3, .brand, .proof-n, .cover-for { font-family: "Plus Jakarta Sans", "Inter", sans-serif; }

  /* Cover — Modern Executive Presentation */
  .cover { display: flex; flex-direction: column; min-height: 262mm; }
  .cover-top {
    background: #060B1E;
    /* Navy into the logo's blue into the logo's red. The previous midpoint sat
       at #1E1B4B, which is indigo — blending brand blue to brand red through
       the shortest path produces a purple this company does not own. Routing it
       through the blue keeps every stop a colour that is actually ours. */
    background: linear-gradient(118deg, #070C1F 0%, #123069 46%, #6E1018 100%);
    color: #fff; margin: -14mm -13mm 0; padding: 14mm 14mm 10mm;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .stripe { display: flex; height: 3mm; margin: 0 -13mm; }
  .s1 { background: #991b1b; flex: 5; }
  .s2 { background: #dc2626; flex: 3; }
  .s3 { background: #2563eb; flex: 2; }

  .brand-row { display: flex; align-items: center; gap: 4mm; }
  /* On a white tile, so the mark reads on any background and survives a
     printer that renders the dark band lighter than the screen does. */
  .brand-mark {
    width: 20mm; height: 20mm; object-fit: contain; flex: none;
    background: #fff; border-radius: 2.5mm; padding: 2.2mm;
    box-shadow: 0 2px 6px rgba(0,0,0,0.25);
  }
  .brand { font-size: 26pt; font-weight: 800; letter-spacing: -.5px; color: #fff; }
  .brand-tag { color: #fca5a5; font-size: 10.5pt; letter-spacing: .08em; text-transform: uppercase; margin-top: 1.5mm; font-weight: 600; }
  .cover-mid { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 10mm 0 8mm; }
  .cover-kicker {
    display: inline-block; align-self: flex-start; background: #991b1b; color: #fff;
    font-size: 8.5pt; letter-spacing: .15em; text-transform: uppercase; font-weight: 700;
    padding: 1.8mm 4mm; border-radius: 1.5mm; box-shadow: 0 2px 4px rgba(153, 27, 27, 0.3);
  }
  h1 { font-size: 38pt; line-height: 1.08; margin: 6mm 0 7mm; color: #0f172a; letter-spacing: -.8px; max-width: 155mm; font-weight: 800; }
  .cover-for-card {
    background: #f8fafc; border-left: 4mm solid #2563eb; padding: 5mm 6mm; margin-bottom: 3mm; border-radius: 0 2mm 2mm 0;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
  .cover-for { font-size: 17.5pt; font-weight: 700; color: #0f172a; }
  .cover-loc { color: #64748b; margin-top: 1mm; font-size: 9.5pt; font-weight: 500; }
  .cover-meta { display: flex; flex-wrap: wrap; gap: 10mm; margin-top: 9mm; font-size: 9.2pt; color: #64748b; }
  .cover-meta b { display: block; color: #0f172a; font-size: 10.2pt; font-weight: 700; }
  /* The cover closes on the same dark panel the last page uses, so the
     document opens and closes on one identity. Formal rather than an ask:
     a cover says who is writing, it does not solicit yet. */
  .cover-foot {
    background: #0f172a; color: #fff; margin: 0 -13mm -14mm; padding: 7mm 13mm 8mm;
    border-top: 3px solid #991b1b;
  }
  .cover-foot-name {
    font-family: "Plus Jakarta Sans", "Inter", sans-serif;
    font-size: 13pt; font-weight: 800; letter-spacing: -.3px; color: #fff;
  }
  .cover-foot-rule { width: 16mm; height: 2px; background: #991b1b; margin: 2.5mm 0 3mm; }
  .cover-foot-lines { font-size: 9.6pt; line-height: 1.6; color: #cbd5e1; }
  .cover-foot-reg {
    margin-top: 3mm; padding-top: 2.5mm; border-top: 1px solid rgba(255,255,255,.12);
    font-size: 8.4pt; color: #94a3b8; letter-spacing: .02em;
  }

  /* Proof Band */
  .proof { display: flex; gap: 3.5mm; margin: 9mm 0 0; }
  .proof-tile {
    flex: 1; background: #f8fafc; padding: 4.5mm 4mm 4mm; text-align: center;
    border-top: 3.5px solid #991b1b; border-radius: 1.5mm;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
  .proof-tile.c1, .proof-tile.c2, .proof-tile.c3 { border-top-color: #dc2626; }
  .proof-n { display: block; font-size: 28pt; font-weight: 800; color: #0f172a; letter-spacing: -.6px; line-height: 1; }
  .proof-l { display: block; font-size: 7.8pt; color: #64748b; margin-top: 2mm; text-transform: uppercase; letter-spacing: .07em; font-weight: 600; }
  .proof-dark .proof-tile { background: rgba(255,255,255,.09); backdrop-filter: blur(8px); border-top-color: #f87171; }
  .proof-dark .proof-n { color: #fff; }
  .proof-dark .proof-l { color: #cbd5e1; }

  /* Journey Pathway */
  /* The ladder, drawn as one. Four boxes side by side say "four things"; a line
     with four stops on it says "this goes somewhere", which is the whole claim. */
  .journey { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; position: relative; margin-top: 2mm; }
  .journey::before {
    content: ""; position: absolute; left: 6%; right: 6%; top: 2.4mm;
    height: 1.5px; background: #e2e8f0;
  }
  .leg { position: relative; padding: 0 3mm; text-align: center; }
  .leg::before {
    content: ""; position: absolute; left: 50%; top: 0;
    width: 5mm; height: 5mm; margin-left: -2.5mm;
    background: #991b1b; border: 2.5px solid #fff; border-radius: 50%;
  }
  .leg-grade {
    display: block; margin-top: 7mm; font-size: 8.4pt; text-transform: uppercase;
    letter-spacing: .09em; color: #991b1b; font-weight: 800;
  }
  .leg-what { font-size: 8.8pt; color: #334155; margin-top: 1.5mm; line-height: 1.4; font-weight: 500; }

  .quote {
    border-left: 3.5px solid #991b1b; padding: 1.2mm 0 1.2mm 5mm; margin: 4mm 0;
    font-size: 12pt; line-height: 1.4; color: #0f172a; font-weight: 600; font-family: "Plus Jakarta Sans", sans-serif;
  }

  /* Disciplines & Rollout */
  /* The disciplines read as a list of what is taught, marked by a small square
     rather than wrapped in a panel each. */
  .disc { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm 9mm; }
  .disc div { break-inside: avoid; padding-left: 5mm; position: relative; }
  .disc div::before {
    content: ""; position: absolute; left: 0; top: 1.6mm;
    width: 2.4mm; height: 2.4mm; background: #2563eb; border-radius: .5mm;
  }
  .disc b { display: block; color: #0f172a; margin-bottom: .8mm; font-size: 11pt; font-weight: 700; }

  /* What the family keeps, drawn from the portfolio targets in the ladder. */
  .parent { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; }
  .parent > div { border-top: 2.5px solid #2563eb; padding-top: 3mm; break-inside: avoid; }
  .parent-when {
    font-size: 8.4pt; text-transform: uppercase; letter-spacing: .08em;
    color: #2563eb; font-weight: 800;
  }
  .parent-what {
    font-size: 11.4pt; font-weight: 700; color: #0f172a;
    margin: 1.2mm 0 1.8mm; letter-spacing: -.2px; line-height: 1.25;
  }
  .parent-body { font-size: 9.6pt; color: #334155; line-height: 1.45; }

  .phases { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3.5mm; }
  .phase { border: 1px solid #e2e8f0; border-top: 3.5px solid #2563eb; padding: 4mm 4.5mm; border-radius: 1.5mm; background: #fff; break-inside: avoid; }
  .phase-when { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; color: #2563eb; font-weight: 800; }
  .phase-name { font-size: 10.2pt; font-weight: 700; color: #0f172a; margin: 1mm 0 1.8mm; }
  .phase-body { font-size: 8.8pt; color: #475569; line-height: 1.45; }

  .ticks { margin: 0; padding: 0; list-style: none; }
  .ticks li {
    position: relative; padding-left: 6.5mm; margin-bottom: 1.6mm; font-size: 9.5pt; color: #334155;
  }
  .ticks li:before {
    content: ""; position: absolute; left: 0; top: 1.6mm;
    width: 2.8mm; height: 2.8mm; background: #2563eb; border-radius: 50%;
  }

  .contact {
    display: flex; gap: 6mm; align-items: flex-start;
    background: #0f172a; color: #fff; padding: 4mm 5.5mm; margin: 5mm 0 0; font-size: 9.2pt; line-height: 1.5; border-radius: 2mm;
  }
  .contact-l {
    font-size: 7.8pt; text-transform: uppercase; letter-spacing: .12em;
    color: #60a5fa; font-weight: 800; white-space: nowrap; padding-top: .6mm;
  }
  .contact b { font-size: 10.8pt; color: #fff; }

  /* Chart */
  .chart { width: 100%; height: auto; display: block; margin: 4mm 0 5mm; }
  .ch-lbl { font: 600 12px "Inter", sans-serif; fill: #1e293b; }
  .ch-val { font: 700 13px "Plus Jakarta Sans", sans-serif; fill: #0f172a; }
  .ch-sub { font: 400 10.5px "Inter", sans-serif; fill: #64748b; }

  /* Two rows of three on the closing page, which also carries the reasons, the
     field proof, the contact block and both signature boxes. At 23mm the strip
     pushed that page past the sheet — and the sheet clips rather than spills, so
     what would have been lost is the signature line. 20mm keeps all six
     photographs and keeps the page whole. */
  .gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.5mm; }
  .gallery img {
    width: 100%; height: 20mm; object-fit: cover; display: block;
    border: 1px solid #e2e8f0; border-radius: 1.5mm; break-inside: avoid;
  }
  /* The strip that follows the four reasons has a page to itself and gets the
     room: a 20mm band of thumbnails proves nothing at arm's length. The one
     above the signature stays small, because that page is nearly full. */
  .gallery-lg img { height: 45mm; }

  /* A heading is type, not a container. Filling every heading and every item
     with the same grey box turns a pitch into a form — seventeen identical
     panels on one page, none of them leading. The accent is a short rule under
     the words; the separation is air. */
  h2 {
    font-size: 17.5pt; color: #0f172a; margin: 0 0 5mm; letter-spacing: -.45px;
    font-weight: 800; line-height: 1.15; position: relative; padding-bottom: 3mm;
  }
  h2::after {
    content: ""; position: absolute; left: 0; bottom: 0;
    width: 18mm; height: 2.5px; background: #991b1b; border-radius: 2px;
  }
  p { margin: 0 0 3mm; }
  .muted { color: #64748b; font-size: 10.2pt; }

  section { margin-bottom: 7mm; break-inside: avoid-page; }
  .rule { display: none; }

  .split { display: flex; gap: 2px; margin: 3.5mm 0 2.5mm; border-radius: 1mm; overflow: hidden; }
  .split .seg {
    padding: 2.8mm 3.5mm; color: #fff; font-size: 9.2pt; font-weight: 700; white-space: nowrap;
  }
  .seg-school { background: #2563eb; }
  .seg-rc { background: #dc2626; }
  .splitkey { display: flex; gap: 7mm; font-size: 8.8pt; color: #64748b; font-weight: 500; }
  .splitkey span { display: flex; align-items: center; gap: 2mm; }
  .sw { width: 3.2mm; height: 3.2mm; display: inline-block; border-radius: .8mm; }
  .sw-school { background: #2563eb; } .sw-rc { background: #dc2626; }

  /* Four reasons, set as columns of type with a hairline above each. No fill,
     no border box — the rule and the space do the separating. */
  .why { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm 9mm; }
  .why div { border-top: 1px solid #e2e8f0; padding-top: 3mm; break-inside: avoid; }
  .why b {
    display: block; margin-bottom: 1.4mm; color: #0f172a; font-weight: 700;
    font-size: 11.6pt; letter-spacing: -.15px;
  }

  table { width: 100%; border-collapse: collapse; font-size: 10.4pt; margin-bottom: 2mm; }
  th { text-align: left; background: #0f172a; color: #fff; padding: 2.2mm 3mm; font-size: 8.5pt; letter-spacing: .06em; text-transform: uppercase; font-weight: 700; }
  td { padding: 1.9mm 3mm; border-bottom: 1px solid #e2e8f0; vertical-align: top; line-height: 1.4; }
  /* Options as cards. Modern, and the only way three fee options fit across A4
     once the body type is large enough to read without leaning in. */
  .offers { display: flex; flex-direction: column; gap: 3.5mm; }
  .offer {
    border: 1px solid #e2e8f0; border-left: 4px solid #cbd5e1;
    border-radius: 2mm; padding: 4mm 5mm; break-inside: avoid; background: #fff;
  }
  .offer-picked { border-left-color: #991b1b; background: #fdf6f6; }
  .offer-top {
    display: flex; justify-content: space-between; align-items: baseline;
    gap: 5mm; margin-bottom: 1.5mm;
  }
  .offer-code {
    font-size: 8.6pt; font-weight: 800; text-transform: uppercase; letter-spacing: .09em;
    color: #991b1b; margin-right: 2mm;
  }
  .offer-name { font-size: 12.5pt; font-weight: 700; color: #0f172a; letter-spacing: -.25px; }
  .offer-price {
    font-size: 12pt; font-weight: 800; color: #991b1b; white-space: nowrap; text-align: right;
  }
  .offer-meta { font-size: 9.4pt; color: #64748b; font-weight: 600; margin-bottom: 2mm; }
  .offer-best { font-size: 10.2pt; color: #334155; margin: 0; line-height: 1.45; }

  .opt { white-space: nowrap; }
  tr.picked td { background: #fff5f5; }
  tr.picked .opt strong { color: #991b1b; }
  .tag {
    display: inline-block; margin-left: 2.5mm; background: #991b1b; color: #fff;
    font-size: 7pt; letter-spacing: .07em; text-transform: uppercase; font-weight: 700;
    padding: .6mm 1.8mm; border-radius: 1mm; vertical-align: middle;
  }
  .opt-name { font-size: 9.4pt; color: #64748b; font-weight: 500; }
  .num { white-space: nowrap; color: #991b1b; font-weight: 700; }
  .best { color: #334155; font-size: 9.2pt; line-height: 1.35; }

  .agreed { background: #fff5f5; border: 1px solid #fecaca; padding: 4.5mm 5.5mm; border-radius: 2mm; margin-bottom: 6mm; }
  .agreed-line { font-size: 11.8pt; font-weight: 700; color: #991b1b; margin-bottom: 2mm; }

  .years { display: grid; grid-template-columns: 1fr 1fr; gap: 3.8mm; }
  .year { border: 1px solid #e2e8f0; border-radius: 2mm; overflow: hidden; break-inside: avoid; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.03); }
  /* Reserve two lines of title in every header, so a long theme like "Scratch
     Expertise + Machine Learning" does not sit taller than its neighbour and
     leave the grid looking ragged. Short titles centre in the same height. */
  .year-head {
    display: flex; justify-content: space-between; align-items: center; gap: 2.5mm;
    background: #0f172a; color: #fff; padding: 2.5mm 3.5mm; min-height: 13.4mm;
  }
  .year-title { font-size: 9.2pt; font-weight: 700; line-height: 1.25; }
  .year-grade { font-size: 7.8pt; background: #991b1b; padding: .8mm 2.2mm; border-radius: 1mm; font-weight: 700; white-space: nowrap; }
  .terms { padding: 2.8mm 3.5mm; display: flex; flex-direction: column; gap: 2mm; }
  .term-name { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .07em; color: #991b1b; font-weight: 700; }
  .term-focus { font-size: 8.8pt; color: #334155; }
  .year-foot { border-top: 1px solid #f1f5f9; background: #f8fafc; padding: 2.4mm 3.5mm; font-size: 8.4pt; color: #475569; display: flex; flex-direction: column; gap: 1mm; }
  .foot-lbl { color: #991b1b; font-weight: 700; text-transform: uppercase; font-size: 7.3pt; letter-spacing: .06em; margin-right: 1mm; }

  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; margin-top: 9mm; break-inside: avoid; }
  .sign-box { border-top: 1.5px solid #0f172a; padding-top: 2.5mm; font-size: 9pt; color: #334155; }
  .sign-box b { display: block; margin-bottom: 6.5mm; color: #0f172a; font-weight: 700; }
  .pagehead { display: flex; justify-content: space-between; border-bottom: 2.5px solid #991b1b; padding-bottom: 2.8mm; margin-bottom: 6mm; font-size: 8.8pt; color: #64748b; }
  .pagehead b { color: #0f172a; font-weight: 700; }
</style>
</head>
<body>

<!-- Cover -->
<div class="page cover">
  <div class="cover-top">
    <div class="brand-row">
      <img class="brand-mark" src="${esc(assetUrl(brandAssets.logo))}" alt="">
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
    </div>
  </div>

  <div class="cover-foot">
    <div class="cover-foot-name">${esc(brandContact.displayName)}</div>
    <div class="cover-foot-rule"></div>
    <div class="cover-foot-lines">
      ${esc(brandContact.address)}<br>
      ${esc(brandContact.phone)} &nbsp;·&nbsp; ${esc(brandContact.email)} &nbsp;·&nbsp; ${esc(brandContact.web)}
    </div>
    <div class="cover-foot-reg">${esc(brandContact.registeredName)} &nbsp;·&nbsp; ${esc(brandContact.rcNumber)} &nbsp;·&nbsp; trading as ${esc(brandContact.displayName)}</div>
  </div>
</div>

<!-- Who we are, and why this. Two full arguments now, so they take a sheet each
     when both are printing — and share one when the studio has switched either
     off, because a page that exists to hold a section nobody selected prints as
     a blank sheet in the middle of a proposal. -->
<div class="page">
  <div class="pagehead"><span><b>Partnership Proposal</b> · ${esc(input.school.name)}</span><span>${esc(input.reference)}</span></div>

${on('intro') ? `  <section>
    <div class="rule"></div>
    <h2>Who you would be partnering with</h2>
    <p><b>${esc(brandContact.registeredName)}</b>, trading as ${esc(brandContact.displayName)} (${esc(brandContact.rcNumber)}), is a STEM, robotics and artificial intelligence education partner based in ${esc(brandContact.addressShort)}. For over ten years we have taught young people to build with technology, and we deliver that work as a school\u2019s own technology department \u2014 our facilitators, our curriculum, our kits and our platform, running on your site and inside your timetable.${
      input.proof
        ? ` ${approx(input.proof.partnerSchools)} schools across Edo State run it today, for ${approx(input.proof.students)} students.`
        : ''
    }</p>
    <div class="why">
      <div><b>Our mission \u2014 transform STEM education</b>To replace rote memorisation with project-driven computational thinking, building creativity, analytical reasoning and genuine software engineering capability in primary and secondary learners.</div>
      <div><b>Our vision \u2014 Africa\u2019s technology leadership</b>To equip every young learner with internationally competitive skills, positioning West Africa as a primary exporter of technology talent and innovation.</div>
    </div>
    <!-- Says nothing about how many years. A quote can be scoped to one, and the
         page beside this one already prints the real count from the curriculum
         being sold; a hardcoded "twelve-year" here would contradict it. -->
    <p class="muted" style="margin-top:5mm">The fees, the progression and the responsibilities on each side are set out here exactly as they run in our partner schools today.</p>
  </section>` : ''}
${splitOverview && on('fieldProof') ? fieldProofSection : ''}
${
  splitOverview
    ? `  ${portfolioBlock()}
</div>

<div class="page">
  <div class="pagehead"><span><b>Partnership Proposal</b> · ${esc(input.school.name)}</span><span>${esc(input.reference)}</span></div>
`
    : ''
}
${on('pitch') ? `  <section>
    <div class="rule"></div>
    <h2>Why this, and why now</h2>
    <p>${esc(narrative.opening)}</p>
    <div class="why">
      ${narrative.benefits
        .map((b) => `<div><b>${esc(b.title)}</b>${esc(b.body)}</div>`)
        .join('\n      ')}
    </div>
  </section>` : ''}
${
  // Four claims, then photographs of them being true. Only when the overview took
  // two sheets: that page has the room for a strip, and on the single-sheet
  // layout there is none.
  splitOverview ? galleryStrip(0, 'The programme running', true) : ''
}
  ${splitOverview ? '' : portfolioBlock()}
</div>

<!-- What is taught, and how it lands in the school. Its own sheet: these are
     the two questions a head teacher asks after "why", and cramming them under
     the pitch is what pushed that page past the sheet. -->
<div class="page">
  <div class="pagehead"><span><b>The programme</b> · ${esc(input.school.name)}</span><span>${esc(input.reference)}</span></div>

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
${on('disciplines') ? `  <section>
    <div class="rule"></div>
    <h2>What we teach</h2>
    <div class="disc">
      ${DISCIPLINES.map(
        (d) => `<div><b>${esc(d.name)}</b>${esc(d.body)}</div>`,
      ).join('')}
    </div>
  </section>` : ''}

${on('rollout') ? `  <section>
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
  </section>` : ''}
</div>

<!-- Commercials -->
<div class="page">
  <div class="pagehead"><span><b>Partnership Proposal</b> · ${esc(input.school.name)}</span><span>${esc(input.reference)}</span></div>

  ${agreed}

  <section>
    <div class="rule"></div>
    <h2>${input.agreedTerms ? 'Standard options for reference' : 'Choose the shape that fits your school'}</h2>
    <p class="muted">What a parent pays over a full session, so the three can be weighed against each other rather than read one at a time.</p>
    ${offersChart()}

    <div class="offers">
      ${offers
        .map((o) => offerCard(o, !!input.scopeToOffer && o.scope === input.scopeToOffer))
        .join('')}
    </div>
    <p class="muted" style="margin-top:2mm">Fees are per student per term. The programme runs on the school calendar, and billing follows the same terms your school already invoices on.${
      input.validUntilLabel
        ? ` These fees stand until ${esc(input.validUntilLabel)}; after that we will re-quote before anything is signed.`
        : ''
    }</p>
  </section>

</div>

<!-- The money page. Its own sheet, because a head teacher reads this one twice. -->
<div class="page">
  <div class="pagehead"><span><b>Your return</b> · ${esc(input.school.name)}</span><span>${esc(input.reference)}</span></div>

  ${splitBlock()}

  ${upsideBlock()}

${on('sideBySide') ? `  <section>
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
  </section>` : ''}
</div>

${
  on('curriculum') && primary.length
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
  on('curriculum') && secondary.length
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

${on('whyNow') ? `  <section>
    <div class="rule"></div>
    <h2>Why now</h2>
    <ul class="ticks">
      ${WHY_NOW.map((w) => `<li>${esc(w)}</li>`).join('')}
    </ul>
  </section>` : ''}

${on('fieldProof') && !splitOverview ? fieldProofSection : ''}

  ${splitOverview ? galleryStrip(3, 'Inside a partner school', true) : gallery}

  ${closingBlock}
</div>

</body>
</html>`;
}
